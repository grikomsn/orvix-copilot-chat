import * as vscode from "vscode";
import { OrvixAuth, type GatewaySession } from "./auth/auth";
import { messageOf } from "./errors";
import {
  FALLBACK_MODEL_METADATA,
  FALLBACK_MODELS,
  formatTokenLimit,
  formatModelName,
  enrichModelMetadata,
  orderModelMetadata,
  type OrvixApiModel,
  type OrvixModelMetadata,
} from "./models/catalog";
import { modelPricingFields } from "./models/pricing";
import {
  applyReasoningEffort,
  buildThinkingSchema,
  resolveEffortValue,
  type ReasoningEffort,
} from "./models/options";
import { parseCatalogSnapshots } from "./models/cache";
import { ModelsDevMetadata, resolveModelsDevMetadata } from "./models/metadata";
import { ChatCompletionStreamParser, validateStreamCompletion } from "./transport/sse";
import { ORVIX_ENDPOINTS, ORVIX_GATEWAY_ENDPOINTS, orvixHeaders } from "./transport/protocol";
import { apiError } from "./transport/errors";
import { modelFamily } from "./models/family";
import { apiKeyFromConfiguration, credentialRefForApiKey, qualifiedModelId } from "./provider-profile";
import { isTransientNetworkError, isTransientServerError, retryDelayMs } from "./provider/retry";
import { messageToText } from "./provider/messages";
import { buildRequest } from "./provider/request";
import { reportEvent } from "./provider/response";
import {
  mergeUsageSnapshot,
  parseBillingPayload,
  parseTransactionsPayload,
  parseUsageSummaryPayload,
  recordApiRequestUsage,
  type OrvixUsageSnapshot,
} from "./usage/domain";

export { API_BASE } from "./transport/protocol";

export interface OrvixModel extends vscode.LanguageModelChatInformation {
  rawModelId: string;
  credentialRef: string;
  reasoningEffort: boolean;
}

export class OrvixProvider implements vscode.LanguageModelChatProvider<OrvixModel> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly usageEmitter = new vscode.EventEmitter<OrvixUsageSnapshot>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;
  /** Fires with the full usage snapshot whenever credits or usage change. */
  readonly onDidChangeUsage = this.usageEmitter.event;
  private readonly catalogs = new Map<string, OrvixModelMetadata[]>();
  private readonly refreshedAt = new Map<string, number>();
  private readonly apiKeys = new Map<string, string>();
  private usage: OrvixUsageSnapshot = {};
  private readonly metadata: ModelsDevMetadata;

  private get configuration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("orvixCopilot");
  }

  private get debugLogging(): boolean {
    return this.configuration.get("debugLogging", false);
  }

  constructor(
    private readonly auth: OrvixAuth,
    private readonly output: vscode.OutputChannel,
    private readonly userAgent: string,
    private readonly state?: vscode.Memento,
    initialUsage: Readonly<OrvixUsageSnapshot> = {},
  ) {
    // Seed from persisted globalState so the status bar is populated before
    // the first gateway refresh completes.
    this.usage = { ...initialUsage };
    this.metadata = new ModelsDevMetadata(state ?? new MemoryMetadataCache());
    for (const [key, catalog] of Object.entries(parseCatalogSnapshots(state?.get<unknown>(CATALOG_STATE_KEY))))
      this.catalogs.set(key, catalog);
  }

  fireDidChange(): void {
    this.changeEmitter.fire();
  }

  /** Returns the current usage snapshot without side effects. @see {@link refreshUsage} */
  getUsageSnapshot(): OrvixUsageSnapshot {
    return this.usage;
  }

  /** Resets locally tracked usage (credits and summary are re-fetched on next refresh). */
  clearUsage(): void {
    this.setAndEmitUsage({});
  }

  /**
   * Refreshes credits, credit transactions, and the 7-day usage summary from
   * the Orvix gateway, then returns the updated snapshot.
   *
   * When `promptForSession` is set, a missing gateway session triggers the
   * **Import Usage Session** flow instead of silently degrading. Auto refreshes
   * (e.g. on activation) keep it `false` so they degrade without interrupting.
   *
   * Billing and summary failures are captured independently: a billing error
   * sets `apiError`, while a summary failure only logs, so one broken endpoint
   * never blanks the other.
   *
   * @example
   * await provider.refreshUsage();
   * provider.getUsageSnapshot().credits?.availableMicrousd; // e.g. 250000
   *
   * @see {@link getUsageSnapshot}, {@link onDidChangeUsage}, {@link hasGatewaySession}
   */
  async refreshUsage(promptForSession = false): Promise<OrvixUsageSnapshot> {
    const session = await this.requireGatewaySession(promptForSession);
    if (!session) {
      // No gateway session: the API key is inferencing-only, so fall back to
      // local session tracking and explain the limitation.
      const message = "Orvix usage requires a browser sign-in (the API key is inferencing-only)";
      this.mergeAndEmitUsage({ apiError: message, updatedAt: Date.now() });
      return this.getUsageSnapshot();
    }

    try {
      const billingResponse = await fetch(ORVIX_GATEWAY_ENDPOINTS.billing, {
        headers: this.gatewaySessionHeaders(session, "application/json"),
      });
      if (billingResponse.status === 401) {
        throw new Error("Orvix usage requires a refreshed browser sign-in");
      }
      if (!billingResponse.ok) throw await apiError("Unable to read Orvix billing", billingResponse);
      const billing = parseBillingPayload(await billingResponse.json());
      this.mergeAndEmitUsage({ credits: billing, apiError: undefined, updatedAt: Date.now() });

      let transactions;
      try {
        const transactionResponse = await fetch(
          `${ORVIX_GATEWAY_ENDPOINTS.transactions}?limit=50&offset=0`,
          { headers: this.gatewaySessionHeaders(session, "application/json") },
        );
        if (transactionResponse.status === 401) {
          throw new Error("Orvix usage requires a refreshed browser sign-in");
        }
        if (!transactionResponse.ok)
          throw await apiError("Unable to read Orvix credit transactions", transactionResponse);
        transactions = parseTransactionsPayload(await transactionResponse.json());
      } catch (error) {
        this.output.appendLine(`[usage] transaction refresh unavailable: ${messageOf(error)}`);
      }
      this.mergeAndEmitUsage({ transactions, updatedAt: Date.now() });
    } catch (error) {
      const message = messageOf(error);
      this.output.appendLine(`[usage] Orvix credits refresh unavailable: ${message}`);
      this.mergeAndEmitUsage({ apiError: message, updatedAt: Date.now() });
    }

    try {
      const summaryResponse = await fetch(`${ORVIX_GATEWAY_ENDPOINTS.usageSummary}?range=7d`, {
        headers: this.gatewaySessionHeaders(session, "application/json"),
      });
      if (summaryResponse.status === 401) {
        throw new Error("Orvix usage requires a refreshed browser sign-in");
      }
      if (!summaryResponse.ok) throw await apiError("Unable to read Orvix usage summary", summaryResponse);
      const summary = parseUsageSummaryPayload(await summaryResponse.json());
      this.mergeAndEmitUsage({ summary, updatedAt: Date.now() });
    } catch (error) {
      this.output.appendLine(`[usage] Orvix usage summary refresh unavailable: ${messageOf(error)}`);
    }

    return this.getUsageSnapshot();
  }

  /** Returns whether a gateway (usage/billing) session has been imported. */
  async hasGatewaySession(): Promise<boolean> {
    return Boolean(await this.auth.getGatewaySession());
  }

  /** Stores a browser gateway session (imported by the user) for usage access. */
  async configureGatewaySession(session: GatewaySession): Promise<void> {
    await this.testGatewaySession(session);
    await this.auth.storeGatewaySession(session);
    await this.refreshUsage();
  }

  async clearGatewaySession(): Promise<void> {
    await this.auth.clearGatewaySession();
  }

  /** Probes the gateway with a session token to confirm it is valid before storing. */
  private async testGatewaySession(session: GatewaySession): Promise<void> {
    const response = await fetch(ORVIX_GATEWAY_ENDPOINTS.billing, {
      headers: this.gatewaySessionHeaders(session, "application/json"),
    });
    if (!response.ok) throw await apiError("Unable to validate Orvix usage session", response);
  }

  async configureApiKey(apiKey: string): Promise<string[]> {
    const models = await this.fetchModels(apiKey.trim());
    await this.auth.storeApiKey(apiKey);
    this.apiKeys.set("legacy", apiKey.trim());
    this.setCatalog("legacy", models);
    this.changeEmitter.fire();
    return models.map(({ id }) => id);
  }

  async clearApiKey(): Promise<void> {
    await this.auth.clearApiKey();
    this.apiKeys.delete("legacy");
    this.setCatalog("legacy", [...FALLBACK_MODEL_METADATA]);
    this.refreshedAt.delete("legacy");
    this.changeEmitter.fire();
  }

  async refreshModels(): Promise<string[]> {
    const apiKey = await this.requireApiKey(false, "legacy");
    const models = await this.refreshCatalog("legacy", apiKey);
    this.changeEmitter.fire();
    return models.map(({ id }) => id);
  }

  async provideLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions,
    token: vscode.CancellationToken,
  ): Promise<OrvixModel[]> {
    const legacyApiKey = await this.auth.getApiKey();
    const configuredApiKey = options.configuration ? apiKeyFromConfiguration(options.configuration) : undefined;
    if (token.isCancellationRequested || (options.configuration && !configuredApiKey)) return [];
    const apiKey = configuredApiKey ?? legacyApiKey;
    const credentialRef = configuredApiKey ? credentialRefForApiKey(configuredApiKey, legacyApiKey) : "legacy";
    if (apiKey) this.apiKeys.set(credentialRef, apiKey);
    const maxAge = Math.max(1, this.configuration.get("catalogCacheMinutes", 5)) * 60_000;
    if (apiKey && Date.now() - (this.refreshedAt.get(credentialRef) ?? 0) > maxAge) {
      try {
        await this.refreshCatalog(credentialRef, apiKey, token);
      } catch (error) {
        if (!token.isCancellationRequested) {
          this.output.appendLine(`[models] discovery failed; using cached/fallback list: ${messageOf(error)}`);
        }
      }
    }

    return this.catalogFor(credentialRef).map((metadata) => {
      const pricing = modelPricingFields(metadata.cost);
      return {
        id: qualifiedModelId(credentialRef, metadata.id),
        rawModelId: metadata.id,
        credentialRef,
        reasoningEffort: metadata.reasoningEffort,
        name: metadata.name || formatModelName(metadata.id),
        family: modelFamily(metadata.id),
        version: metadata.version,
        detail:
          credentialRef === "legacy"
            ? apiKey
              ? "Orvix"
              : "Orvix API key required"
            : `Orvix · ${credentialRef.slice(0, 8)}`,
        tooltip: `${metadata.id} via Orvix · ${formatTokenLimit(metadata.contextLength)} context · ${formatTokenLimit(
          metadata.maxOutputTokens,
        )} max output${metadata.imageInput ? " · image input" : " · text input"}${
          metadata.releaseDate ? ` · released ${metadata.releaseDate}` : ""
        }${pricing ? ` · ${pricing.pricing}` : ""}${metadata.description ? `\n${metadata.description}` : ""}`,
        maxInputTokens: metadata.contextLength,
        maxOutputTokens: metadata.maxOutputTokens,
        isUserSelectable: true,
        ...(credentialRef !== "legacy" ? { isBYOK: true } : {}),
        ...(credentialRef === "legacy" && !apiKey
          ? { requiresAuthorization: { label: "Configure Orvix API key" } }
          : {}),
        ...(buildThinkingSchema(metadata) ?? {}),
        capabilities: {
          imageInput: metadata.imageInput,
          toolCalling: metadata.toolCalling,
        },
        ...(pricing ?? {}),
      };
    });
  }

  async provideLanguageModelChatResponse(
    model: OrvixModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const apiKey = await this.requireApiKey(false, model.credentialRef);
    const reasoningEffort = resolveEffortValue(
      model,
      options.modelConfiguration,
      this.configuration.get("reasoningEffort", "high"),
    );
    const requestBody = buildRequest(
      model.rawModelId,
      messages,
      options,
      reasoningEffort,
      model.maxOutputTokens,
      this.configuration.get("maxOutputTokens", 0),
      Boolean(model.capabilities?.imageInput),
      model.reasoningEffort,
    );
    const controller = new AbortController();
    const cancellation = token.onCancellationRequested(() => controller.abort());
    const timeoutSeconds = Math.max(10, this.configuration.get("requestTimeoutSeconds", 600));
    const idleTimeoutSeconds = Math.max(10, this.configuration.get("streamIdleTimeoutSeconds", 120));
    let timedOut: "total" | "idle" | undefined;
    const totalTimeout = setTimeout(() => {
      timedOut = "total";
      controller.abort();
    }, timeoutSeconds * 1000);
    let idleTimeout: ReturnType<typeof setTimeout> | undefined;
    const resetIdleTimeout = (): void => {
      if (idleTimeout) clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        timedOut = "idle";
        controller.abort();
      }, idleTimeoutSeconds * 1000);
    };
    resetIdleTimeout();
    try {
      if (this.debugLogging) {
        this.output.appendLine(
          `[request] model=${model.rawModelId} effort=${reasoningEffort} initiator=${
            options.requestInitiator ?? "unknown"
          }`,
        );
      }
      const response = await this.fetchInference({
        method: "POST",
        headers: this.requestHeaders(apiKey, "text/event-stream"),
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      if (!response.ok) throw await apiError(`Orvix request failed for ${model.rawModelId}`, response);
      if (!response.body) throw new Error("Orvix returned an empty response stream");

      const parser = new ChatCompletionStreamParser();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        if (token.isCancellationRequested) {
          await reader.cancel();
          return;
        }
        const result = await reader.read();
        if (result.done) break;
        resetIdleTimeout();
        for (const event of parser.push(decoder.decode(result.value, { stream: true }))) {
          // The final streamed chunk carries the `usage` object; capture it
          // when present so the status bar reflects the request immediately.
          reportEvent(event, progress, (usage) => this.captureRequestUsage(usage, model.rawModelId));
        }
      }
      for (const event of parser.finish())
        reportEvent(event, progress, (usage) => this.captureRequestUsage(usage, model.rawModelId));
      validateStreamCompletion(parser.finishReason);
    } catch (error) {
      if (token.isCancellationRequested) return;
      if (timedOut === "idle")
        throw new Error(`Orvix request for ${model.rawModelId} received no data for ${idleTimeoutSeconds} seconds`);
      if (timedOut === "total")
        throw new Error(`Orvix request for ${model.rawModelId} exceeded ${timeoutSeconds} seconds`);
      throw error;
    } finally {
      clearTimeout(totalTimeout);
      if (idleTimeout) clearTimeout(idleTimeout);
      cancellation.dispose();
    }
  }

  async provideTokenCount(
    _model: OrvixModel,
    value: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Promise<number> {
    const text = typeof value === "string" ? value : messageToText(value);
    return Math.max(1, Math.ceil(text.length / 4));
  }

  async testConnection(): Promise<{
    model: string;
    reasoningEffort?: ReasoningEffort;
    text: string;
  }> {
    const credentialRef = "legacy";
    const apiKey = await this.requireApiKey(false, credentialRef);
    const models = this.catalogFor(credentialRef);
    const model = models[0]?.id ?? FALLBACK_MODELS[0];
    const modelMetadata = models[0];
    const reasoningEffort = modelMetadata
      ? resolveEffortValue(modelMetadata, undefined, this.configuration.get("reasoningEffort", "high"))
      : undefined;
    const requestBody = {
      model,
      messages: [
        {
          role: "user",
          content: "Reply with exactly: Orvix connection verified",
        },
      ],
      max_tokens: 512,
      stream: false,
    };
    const response = await fetch(ORVIX_ENDPOINTS.chat, {
      method: "POST",
      headers: this.requestHeaders(apiKey, "application/json"),
      body: JSON.stringify(
        reasoningEffort ? applyReasoningEffort(requestBody, reasoningEffort) : requestBody,
      ),
    });
    if (!response.ok) throw await apiError("Orvix connection test failed", response);
    const responseBody = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: Record<string, unknown>;
    };
    if (responseBody.usage) this.captureRequestUsage(responseBody.usage, model);
    return {
      model,
      ...(reasoningEffort ? { reasoningEffort } : {}),
      text: responseBody.choices?.[0]?.message?.content?.trim() ?? "(empty response)",
    };
  }

  private async fetchModels(apiKey: string): Promise<OrvixModelMetadata[]> {
    if (!apiKey) throw new Error("Orvix API key is not configured");
    const response = await fetch(ORVIX_ENDPOINTS.models, {
      headers: this.requestHeaders(apiKey, "application/json, application/problem+json"),
    });
    if (!response.ok) throw await apiError("Unable to list Orvix models", response);
    const body = (await response.json()) as { data?: OrvixApiModel[] };
    const enrichment = await this.metadata.getOrRefresh();
    const models = orderModelMetadata(body.data ?? []).map((model) =>
      enrichModelMetadata(model, resolveModelsDevMetadata(enrichment, model.id, model.ownedBy)),
    );
    if (!models.length) throw new Error("Orvix returned no chat-capable models");
    if (this.debugLogging) this.output.appendLine(`[models] ${models.map(({ id }) => id).join(", ")}`);
    return models;
  }

  private async requireApiKey(prompt: boolean, credentialRef: string): Promise<string> {
    let apiKey = credentialRef === "legacy" ? await this.auth.getApiKey() : this.apiKeys.get(credentialRef);
    if (!apiKey && prompt && credentialRef === "legacy") {
      await vscode.commands.executeCommand("orvixCopilot.configureApiKey");
      apiKey = await this.auth.getApiKey();
    }
    if (!apiKey) {
      throw new Error(
        credentialRef === "legacy"
          ? "Orvix API key is not configured. Run ‘Orvix: Configure API Key’."
          : "The API key for this Orvix provider entry is unavailable. Update the entry in Manage Language Models.",
      );
    }
    return apiKey;
  }

  private catalogFor(credentialRef: string): OrvixModelMetadata[] {
    let catalog = this.catalogs.get(credentialRef);
    if (!catalog) {
      catalog = [...FALLBACK_MODEL_METADATA];
      this.catalogs.set(credentialRef, catalog);
    }
    return catalog;
  }

  private setCatalog(credentialRef: string, models: readonly OrvixModelMetadata[]): void {
    this.catalogs.set(credentialRef, [...models]);
    this.refreshedAt.set(credentialRef, Date.now());
    void this.state?.update(CATALOG_STATE_KEY, Object.fromEntries(this.catalogs));
  }

  private async refreshCatalog(
    credentialRef: string,
    apiKey: string,
    token?: vscode.CancellationToken,
  ): Promise<OrvixModelMetadata[]> {
    if (token?.isCancellationRequested) return this.catalogFor(credentialRef);
    const models = await this.fetchModels(apiKey);
    this.setCatalog(credentialRef, models);
    return models;
  }

  private requestHeaders(apiKey: string, accept: string): Record<string, string> {
    return orvixHeaders(apiKey, accept, this.userAgent);
  }

  /** Builds headers for the Orvix gateway with the inferencing API key. */
  private gatewayHeaders(apiKey: string, accept: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      Accept: accept,
      "User-Agent": this.userAgent,
    };
  }

  /** Builds headers for the Orvix gateway using a user session token. */
  private gatewaySessionHeaders(session: GatewaySession, accept: string): Record<string, string> {
    return {
      Authorization: `Bearer ${session.token}`,
      Accept: accept,
      "User-Agent": this.userAgent,
    };
  }

  /** Loads the gateway session if present, optionally prompting to import one. */
  private async requireGatewaySession(prompt: boolean): Promise<GatewaySession | undefined> {
    const session = await this.auth.getGatewaySession();
    if (session) return session;
    if (prompt) {
      await vscode.commands.executeCommand("orvixCopilot.configureGatewaySession");
      return this.auth.getGatewaySession();
    }
    return undefined;
  }

  private async fetchInference(init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await fetch(ORVIX_ENDPOINTS.chat, init);
        if (attempt >= 2 || !isTransientServerError(response.status)) return response;
        const delay = retryDelayMs(attempt, response.headers.get("retry-after"));
        this.output.appendLine(`[retry] transient HTTP ${response.status}; attempt=${attempt + 2} delayMs=${delay}`);
        await response.body?.cancel().catch(() => undefined);
        await waitForRetry(delay, init.signal);
      } catch (error) {
        if (attempt >= 2 || !isTransientNetworkError(error)) throw error;
        const delay = retryDelayMs(attempt);
        this.output.appendLine(`[retry] transient network failure; attempt=${attempt + 2} delayMs=${delay}`);
        await waitForRetry(delay, init.signal);
      }
    }
  }

  /**
   * Records one inference request's usage into the snapshot and emits it.
   *
   * @see {@link recordApiRequestUsage}, {@link setAndEmitUsage}
   */
  private captureRequestUsage(raw: Record<string, unknown>, modelId: string): void {
    const next = recordApiRequestUsage(this.getUsageSnapshot(), raw, modelId);
    if (this.debugLogging) this.output.appendLine(`[usage] model=${modelId} ${JSON.stringify(raw)}`);
    this.setAndEmitUsage(next);
  }

  /**
   * Merges a partial update into the snapshot and emits the result.
   *
   * @see {@link mergeUsageSnapshot}, {@link setAndEmitUsage}
   */
  private mergeAndEmitUsage(update: OrvixUsageSnapshot): void {
    this.setAndEmitUsage(mergeUsageSnapshot(this.getUsageSnapshot(), update));
  }

  /** Replaces the snapshot and fires {@link onDidChangeUsage}. */
  private setAndEmitUsage(usage: OrvixUsageSnapshot): void {
    this.usage = usage;
    this.usageEmitter.fire(usage);
  }
}

const CATALOG_STATE_KEY = "orvixCopilot.catalogs.v1";

class MemoryMetadataCache {
  get<T>(_key: string): T | undefined {
    return undefined;
  }
  async update(_key: string, _value: unknown): Promise<void> {}
}

async function waitForRetry(milliseconds: number, signal: AbortSignal | null | undefined): Promise<void> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
