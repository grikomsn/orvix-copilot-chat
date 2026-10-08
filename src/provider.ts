import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { OrvixAuth, type GatewaySession } from "./auth/auth";
import { messageOf } from "./errors";
import {
  advertisedModelLimits,
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
  buildModelConfigurationSchema,
  contextSizeOptions,
  resolveContextCap,
  resolveContextSize,
  resolveEffortValue,
  type ReasoningEffort,
} from "./models/options";
import { parseCatalogSnapshots } from "./models/cache";
import { ModelsDevMetadata, resolveModelsDevMetadata } from "./models/metadata";
import { ChatCompletionStreamParser, validateStreamCompletion } from "./transport/sse";
import { ORVIX_ENDPOINTS, ORVIX_GATEWAY_ENDPOINTS, orvixHeaders } from "./transport/protocol";
import { apiError } from "./transport/errors";
import { modelFamily } from "./models/family";
import { NativeEntries, entryIdFromConfiguration, qualifiedModelId, type NativeEntry } from "./provider-profile";
import { isTransientNetworkError, isTransientServerError, retryDelayMs } from "./provider/retry";
import { messageToText } from "./provider/messages";
import { buildRequest } from "./provider/request";
import { trimHistoryToFit } from "./provider/history-trim";
import { StreamResponseReporter } from "./provider/response";
import { observeEntry, observedEntries } from "./provider-journal";
import {
  mergeUsageSnapshot,
  parseBillingPayload,
  parseTransactionsPayload,
  parseUsageSummaryPayload,
  parseAccountBalancePayload,
  parseImageCredits,
  parseTopUpsPayload,
  recordApiRequestUsage,
  type OrvixUsageSnapshot,
} from "./usage/domain";

export { API_BASE } from "./transport/protocol";

export interface OrvixModel extends vscode.LanguageModelChatInformation, NativeEntry {
  rawModelId: string;
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
  private readonly entries: NativeEntries;
  private readonly billingRevisions = new Map<string, number>();
  private readonly usageByCredential = new Map<string, OrvixUsageSnapshot>();
  private readonly metadata: ModelsDevMetadata;
  private stateMutation: Promise<void> = Promise.resolve();

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
    initialUsage: Readonly<Record<string, OrvixUsageSnapshot>> = {},
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const forgotten = state?.get<unknown>("orvixCopilot.forgottenEntries.v1");
    this.entries = new NativeEntries(Array.isArray(forgotten) ? forgotten.filter((id): id is string => typeof id === "string") : []);
    // Only inference activity is persisted; billing ownership is freshly bound.
    for (const [ref, usage] of Object.entries(initialUsage)) this.usageByCredential.set(ref, usage);
    this.metadata = new ModelsDevMetadata(state ?? new MemoryMetadataCache(), this.fetcher);
    for (const [key, catalog] of Object.entries(parseCatalogSnapshots(state?.get<unknown>(CATALOG_STATE_KEY))))
      this.catalogs.set(key, catalog);
  }

  fireDidChange(): void {
    this.changeEmitter.fire();
    this.usageEmitter.fire(this.getSelectedUsageSnapshot());
  }

  /** Returns the current usage snapshot without side effects. @see {@link refreshUsage} */
  getUsageSnapshot(entry = this.selectedEntry()): OrvixUsageSnapshot {
    return this.usageByCredential.get(entry.credentialRef) ?? {};
  }

  getSelectedUsageSnapshot(): OrvixUsageSnapshot {
    try { return this.getUsageSnapshot(); } catch { return {}; }
  }

  getEntries(): NativeEntry[] { return this.entries.list(); }
  getForgottenEntries(): string[] { return this.entries.forgottenIds(); }

  async restoreEntry(entryId: string): Promise<void> {
    this.entries.restore(entryId);
    await this.persistOwnedState();
    this.changeEmitter.fire();
  }

  getObservedEntries(): ReturnType<typeof observedEntries> {
    return this.state ? observedEntries(this.state) : {};
  }

  selectedEntry(): NativeEntry {
    return this.entries.get(this.configuration.get("managementEntry", ""));
  }

  getFeatureApiKey(setting: "inlineSuggestionsEntry" | "imageEntry"): string | undefined {
    const entryId = this.configuration.get<string>(setting, "");
    if (!entryId) return undefined;
    return this.entries.key(this.entries.get(entryId));
  }

  async forgetEntry(entryId: string): Promise<void> {
    const entry = this.entries.list().find((item) => item.entryId === entryId);
    this.entries.forget(entryId);
    this.billingRevisions.set(entryId, (this.billingRevisions.get(entryId) ?? 0) + 1);
    await this.auth.clearGatewaySession(entryId);
    if (entry) {
      this.usageByCredential.delete(entry.credentialRef);
      this.catalogs.delete(entry.credentialRef);
      this.refreshedAt.delete(entry.credentialRef);
    }
    await this.persistOwnedState();
    if (this.state) await observeEntry(this.state, entryId, undefined);
    this.changeEmitter.fire();
    this.usageEmitter.fire({});
  }

  /** Resets locally tracked usage (credits and summary are re-fetched on next refresh). */
  clearUsage(): void {
    this.setAndEmitUsage({}, this.selectedEntry());
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
  async refreshUsage(promptForSession = false, entry = this.selectedEntry()): Promise<OrvixUsageSnapshot> {
    const revision = this.billingRevisions.get(entry.entryId) ?? 0;
    const merge = (update: OrvixUsageSnapshot): void => {
      if ((this.billingRevisions.get(entry.entryId) ?? 0) === revision) this.mergeAndEmitUsage(update, entry);
    };
    const session = await this.requireGatewaySession(entry, promptForSession);
    if (!session) {
      // No gateway session: the API key is inferencing-only, so fall back to
      // local session tracking and explain the limitation.
      const message = "Orvix usage requires a browser sign-in (the API key is inferencing-only)";
      merge({ apiError: message, updatedAt: Date.now() });
      return this.entries.matches(entry) ? this.getUsageSnapshot(entry) : {};
    }

    try {
      const billingResponse = await this.fetcher(ORVIX_GATEWAY_ENDPOINTS.billing, {
        headers: this.gatewaySessionHeaders(session, "application/json"),
      });
      if (billingResponse.status === 401) {
        throw new Error("Orvix usage requires a refreshed browser sign-in");
      }
      if (!billingResponse.ok) throw await apiError("Unable to read Orvix billing", billingResponse);
      const billing = parseBillingPayload(await billingResponse.json());
      merge({ credits: billing, apiError: undefined, updatedAt: Date.now() });

      let transactions;
      try {
        const transactionResponse = await this.fetcher(
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
      merge({ transactions, updatedAt: Date.now() });
    } catch (error) {
      const message = messageOf(error);
      this.output.appendLine(`[usage] Orvix credits refresh unavailable: ${message}`);
      merge({ apiError: message, updatedAt: Date.now() });
    }

    try {
      const summaryResponse = await this.fetcher(`${ORVIX_GATEWAY_ENDPOINTS.usageSummary}?range=7d`, {
        headers: this.gatewaySessionHeaders(session, "application/json"),
      });
      if (summaryResponse.status === 401) {
        throw new Error("Orvix usage requires a refreshed browser sign-in");
      }
      if (!summaryResponse.ok) throw await apiError("Unable to read Orvix usage summary", summaryResponse);
      const summary = parseUsageSummaryPayload(await summaryResponse.json());
      merge({ summary, updatedAt: Date.now() });
    } catch (error) {
      this.output.appendLine(`[usage] Orvix usage summary refresh unavailable: ${messageOf(error)}`);
    }

    try {
      const balanceResponse = await this.fetcher(ORVIX_GATEWAY_ENDPOINTS.balance, {
        headers: this.gatewaySessionHeaders(session, "application/json"),
      });
      if (balanceResponse.status === 401) {
        throw new Error("Orvix usage requires a refreshed browser sign-in");
      }
      if (!balanceResponse.ok) throw await apiError("Unable to read Orvix balance", balanceResponse);
      const balanceBody = await balanceResponse.json();
      const account = parseAccountBalancePayload(balanceBody);
      merge({ account, updatedAt: Date.now() });
      // Image Credits ride on the same /balance payload: they are the
      // grantsImage plans. A refresh only overwrites the balance when the
      // payload carries image plans, so a gateway without the flag keeps the
      // last known value instead of blanking it.
      const imageCredits = parseImageCredits(balanceBody);
      if (imageCredits) merge({ imageCredits, updatedAt: Date.now() });

      let topUps;
      try {
        const topUpResponse = await this.fetcher(ORVIX_GATEWAY_ENDPOINTS.topUps, {
          headers: this.gatewaySessionHeaders(session, "application/json"),
        });
        if (topUpResponse.status === 401) {
          throw new Error("Orvix usage requires a refreshed browser sign-in");
        }
        if (!topUpResponse.ok) throw await apiError("Unable to read Orvix top-ups", topUpResponse);
        topUps = parseTopUpsPayload(await topUpResponse.json());
      } catch (error) {
        this.output.appendLine(`[usage] Orvix top-ups refresh unavailable: ${messageOf(error)}`);
      }
      merge({ topUps, updatedAt: Date.now() });
    } catch (error) {
      const message = messageOf(error);
      this.output.appendLine(`[usage] Orvix balance refresh unavailable: ${message}`);
      merge({ apiError: message, updatedAt: Date.now() });
    }

    return this.entries.matches(entry) ? this.getUsageSnapshot(entry) : {};
  }

  /** Returns whether a gateway (usage/billing) session has been imported. */
  async hasGatewaySession(): Promise<boolean> {
    const entry = this.selectedEntry();
    return Boolean(await this.auth.getGatewaySession(entry.entryId, entry.credentialRef));
  }

  /** Stores a browser gateway session (imported by the user) for usage access. */
  async configureGatewaySession(session: GatewaySession, entry = this.selectedEntry()): Promise<void> {
    this.entries.key(entry);
    const revision = (this.billingRevisions.get(entry.entryId) ?? 0) + 1;
    this.billingRevisions.set(entry.entryId, revision);
    await this.testGatewaySession(session);
    if (!this.entries.matches(entry) || this.billingRevisions.get(entry.entryId) !== revision)
      throw new Error("Orvix entry or billing binding changed during session validation");
    await this.auth.storeGatewaySession(entry.entryId, entry.credentialRef, session);
    const previous = this.getUsageSnapshot(entry);
    this.setAndEmitUsage({ tracked: previous.tracked, lastRequest: previous.lastRequest }, entry);
    await this.refreshUsage(false, entry);
  }

  async clearGatewaySession(): Promise<void> {
    const entry = this.selectedEntry();
    this.billingRevisions.set(entry.entryId, (this.billingRevisions.get(entry.entryId) ?? 0) + 1);
    await this.auth.clearGatewaySession(entry.entryId);
    const previous = this.getUsageSnapshot(entry);
    this.setAndEmitUsage({ tracked: previous.tracked, lastRequest: previous.lastRequest }, entry);
  }

  /** Probes the gateway with a session token to confirm it is valid before storing. */
  private async testGatewaySession(session: GatewaySession): Promise<void> {
    const response = await this.fetcher(ORVIX_GATEWAY_ENDPOINTS.billing, {
      headers: this.gatewaySessionHeaders(session, "application/json"),
    });
    if (!response.ok) throw await apiError("Unable to validate Orvix usage session", response);
  }

  async refreshModels(): Promise<string[]> {
    const entry = this.selectedEntry();
    const models = await this.refreshCatalog(entry, this.entries.key(entry));
    this.changeEmitter.fire();
    return models.map(({ id }) => id);
  }

  async provideLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions,
    token: vscode.CancellationToken,
  ): Promise<OrvixModel[]> {
    if (token.isCancellationRequested || !options.configuration) return [];
    if (this.entries.isForgotten(entryIdFromConfiguration(options.configuration))) return [];
    const previous = this.entries.list().find((item) => item.entryId === options.configuration?.entryId);
    const entry = this.entries.register(options.configuration);
    const { entryId, credentialRef, generation } = entry;
    const apiKey = this.entries.key(entry);
    if (previous && previous.generation !== generation) {
      await this.auth.clearGatewaySession(entryId);
      this.billingRevisions.set(entryId, (this.billingRevisions.get(entryId) ?? 0) + 1);
      this.usageByCredential.delete(previous.credentialRef);
      this.catalogs.delete(previous.credentialRef);
      this.refreshedAt.delete(previous.credentialRef);
      await this.persistOwnedState();
      this.usageEmitter.fire(this.getSelectedUsageSnapshot());
    }
    const maxAge = Math.max(1, this.configuration.get("catalogCacheMinutes", 5)) * 60_000;
    if (apiKey && Date.now() - (this.refreshedAt.get(credentialRef) ?? 0) > maxAge) {
      try {
        await this.refreshCatalog(entry, apiKey, token);
      } catch (error) {
        if (!token.isCancellationRequested) {
          this.output.appendLine(`[models] discovery failed; using cached/fallback list: ${messageOf(error)}`);
        }
      }
    }

    if (token.isCancellationRequested || !this.entries.matches(entry)) return [];
    if (this.state) await observeEntry(this.state, entryId, this.catalogFor(credentialRef).length);
    this.usageEmitter.fire(this.getSelectedUsageSnapshot());
    return this.catalogFor(credentialRef).map((metadata) => {
      const pricing = modelPricingFields(metadata.cost);
      const limits = advertisedModelLimits(metadata, this.configuration.get("maxOutputTokens", 0));
      return {
        id: qualifiedModelId(entryId, metadata.id),
        rawModelId: metadata.id,
        credentialRef,
        entryId,
        generation,
        reasoningEffort: metadata.reasoningEffort,
        name: metadata.name || formatModelName(metadata.id),
        family: modelFamily(metadata.id),
        version: metadata.version,
        detail: `Orvix · ${entryId}`,
        tooltip: `${metadata.id} via Orvix · ${formatTokenLimit(metadata.contextLength)} context · ${formatTokenLimit(
          metadata.maxOutputTokens,
        )} max output${metadata.imageInput ? " · image input" : " · text input"}${
          metadata.releaseDate ? ` · released ${metadata.releaseDate}` : ""
        }${pricing ? ` · ${pricing.pricing}` : ""}${metadata.description ? `\n${metadata.description}` : ""}`,
        ...limits,
        isUserSelectable: true,
        isBYOK: true,
        ...(buildModelConfigurationSchema(metadata, contextSizeOptions(limits.maxInputTokens))
          ? { configurationSchema: buildModelConfigurationSchema(metadata, contextSizeOptions(limits.maxInputTokens)) }
          : {}),
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
    if (token.isCancellationRequested) return;
    const apiKey = this.entries.key(model);
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
      resolveContextCap(resolveContextSize(options.modelConfiguration), model.maxInputTokens),
    );
    const reporter = new StreamResponseReporter(progress, vscode, randomUUID(),
      (usage) => this.captureRequestUsage(usage, model.rawModelId, model));
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
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
      reader = response.body.getReader();
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
          reporter.report(event);
        }
      }
      for (const event of parser.push(decoder.decode())) reporter.report(event);
      for (const event of parser.finish()) reporter.report(event);
      validateStreamCompletion(parser.finishReason);
    } catch (error) {
      if (token.isCancellationRequested) return;
      if (timedOut === "idle")
        throw new Error(`Orvix request for ${model.rawModelId} received no data for ${idleTimeoutSeconds} seconds`);
      if (timedOut === "total")
        throw new Error(`Orvix request for ${model.rawModelId} exceeded ${timeoutSeconds} seconds`);
      throw error;
    } finally {
      reporter.finish();
      controller.abort();
      if (reader) {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
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
    const entry = this.selectedEntry();
    const { credentialRef } = entry;
    const apiKey = this.entries.key(entry);
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
    const response = await this.fetcher(ORVIX_ENDPOINTS.chat, {
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
    if (responseBody.usage) this.captureRequestUsage(responseBody.usage, model, entry);
    return {
      model,
      ...(reasoningEffort ? { reasoningEffort } : {}),
      text: responseBody.choices?.[0]?.message?.content?.trim() ?? "(empty response)",
    };
  }

  private async fetchModels(apiKey: string, signal?: AbortSignal): Promise<OrvixModelMetadata[]> {
    if (!apiKey) throw new Error("Orvix API key is not configured");
    const response = await this.fetcher(ORVIX_ENDPOINTS.models, {
      headers: this.requestHeaders(apiKey, "application/json, application/problem+json"),
      signal,
    });
    if (!response.ok) throw await apiError("Unable to list Orvix models", response);
    const body = (await response.json()) as { data?: OrvixApiModel[] };
    if (!Array.isArray(body.data)) throw new Error("Orvix returned an invalid model directory");
    const enrichment = await this.metadata.getOrRefresh();
    const models = orderModelMetadata(body.data).map((model) =>
      enrichModelMetadata(model, resolveModelsDevMetadata(enrichment, model.id, model.ownedBy)),
    );
    if (this.debugLogging) this.output.appendLine(`[models] ${models.map(({ id }) => id).join(", ")}`);
    return models;
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
    void this.persistOwnedState();
  }

  private async refreshCatalog(
    entry: NativeEntry,
    apiKey: string,
    token?: vscode.CancellationToken,
  ): Promise<OrvixModelMetadata[]> {
    if (token?.isCancellationRequested) return this.catalogFor(entry.credentialRef);
    const controller = new AbortController();
    const cancellation = token?.onCancellationRequested(() => controller.abort());
    try {
      const models = await this.fetchModels(apiKey, controller.signal);
      if (!token?.isCancellationRequested && this.entries.matches(entry)) this.setCatalog(entry.credentialRef, models);
      return models;
    } finally { cancellation?.dispose(); }
  }

  private requestHeaders(apiKey: string, accept: string): Record<string, string> {
    return orvixHeaders(apiKey, accept, this.userAgent);
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
  private async requireGatewaySession(entry: NativeEntry, prompt: boolean): Promise<GatewaySession | undefined> {
    let session = await this.auth.getGatewaySession(entry.entryId, entry.credentialRef);
    if (!session && prompt) {
      await vscode.commands.executeCommand("orvixCopilot.configureGatewaySession");
      session = await this.auth.getGatewaySession(entry.entryId, entry.credentialRef);
    }
    return this.entries.matches(entry) ? session : undefined;
  }

  private async fetchInference(init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await this.fetcher(ORVIX_ENDPOINTS.chat, init);
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
  private captureRequestUsage(raw: Record<string, unknown>, modelId: string, entry: NativeEntry): void {
    if (!this.entries.matches(entry)) return;
    const next = recordApiRequestUsage(this.getUsageSnapshot(entry), raw, modelId);
    if (this.debugLogging) this.output.appendLine(`[usage] model=${modelId} recorded`);
    this.setAndEmitUsage(next, entry);
  }

  private mergeAndEmitUsage(update: OrvixUsageSnapshot, entry: NativeEntry): void {
    if (!this.entries.matches(entry)) return;
    this.setAndEmitUsage(mergeUsageSnapshot(this.getUsageSnapshot(entry), update), entry);
  }

  private setAndEmitUsage(usage: OrvixUsageSnapshot, entry: NativeEntry): void {
    if (!this.entries.matches(entry)) return;
    this.usageByCredential.set(entry.credentialRef, usage);
    void this.persistOwnedState();
    if (this.configuration.get("managementEntry", "") === entry.entryId) this.usageEmitter.fire(usage);
  }

  private persistOwnedState(): Promise<void> {
    this.stateMutation = this.stateMutation.catch(() => undefined).then(async () => {
      if (!this.state) return;
      await this.state.update("orvixCopilot.forgottenEntries.v1", this.entries.forgottenIds());
      await this.state.update(CATALOG_STATE_KEY, Object.fromEntries(this.catalogs));
      const activity = Object.fromEntries([...this.usageByCredential].map(([ref, snapshot]) => [ref, {
        tracked: snapshot.tracked, lastRequest: snapshot.lastRequest,
      }]));
      await this.state.update("orvixCopilot.entryUsage.v1", activity);
    }).catch(() => { this.output.appendLine("[state] unable to persist entry cache"); });
    return this.stateMutation;
  }
}

const CATALOG_STATE_KEY = "orvixCopilot.entryCatalogs.v1";

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
