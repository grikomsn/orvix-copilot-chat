/** Orvix credits and request usage normalization for VS Code. */

export interface OrvixCreditBalance {
  projectId?: string;
  projectName?: string;
  currency?: string;
  availableMicrousd?: number;
  reservedMicrousd?: number;
  status?: string;
  updatedAt?: string;
}

export interface OrvixUsageSummary {
  requests?: number;
  errors?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedPromptTokens?: number;
  estimatedCost?: number;
  chargedCredits?: number;
  avgLatencyMs?: number;
}

export interface OrvixUsageTransaction {
  id: string;
  type: string;
  amountMicrousd?: number;
  reason?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ApiRequestUsage {
  modelId: string;
  recordedAt: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
}

export interface TrackedApiUsage {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  estimatedCostUsd: number;
}

export interface OrvixUsageSnapshot {
  credits?: OrvixCreditBalance;
  transactions?: OrvixUsageTransaction[];
  summary?: OrvixUsageSummary;
  lastRequest?: ApiRequestUsage;
  tracked?: TrackedApiUsage;
  apiError?: string;
  updatedAt?: number;
}

export function parseBillingPayload(raw: unknown): OrvixCreditBalance | undefined {
  const root = isRecord(raw) ? raw : undefined;
  if (!root) return undefined;
  const data = isRecord(root.data) ? root.data : root;
  const result: OrvixCreditBalance = {
    availableMicrousd: nonNegativeNumber(data.availableMicrousd),
    reservedMicrousd: nonNegativeNumber(data.reservedMicrousd),
  };
  const projectId = textValue(data.projectId);
  const projectName = textValue(data.projectName);
  const currency = textValue(data.currency);
  const status = textValue(data.status);
  const updatedAt = textValue(data.updatedAt);
  if (projectId) result.projectId = projectId;
  if (projectName) result.projectName = projectName;
  if (currency) result.currency = currency;
  if (status) result.status = status;
  if (updatedAt) result.updatedAt = updatedAt;
  const hasValue = result.availableMicrousd !== undefined
    || result.reservedMicrousd !== undefined
    || projectId !== undefined
    || projectName !== undefined
    || currency !== undefined
    || status !== undefined
    || updatedAt !== undefined;
  return hasValue ? result : undefined;
}

export function parseUsageSummaryPayload(raw: unknown): OrvixUsageSummary | undefined {
  const root = isRecord(raw) ? raw : undefined;
  if (!root) return undefined;
  const data = isRecord(root.data) ? root.data : root;
  const result: OrvixUsageSummary = {};
  for (const key of [
    "requests",
    "errors",
    "promptTokens",
    "completionTokens",
    "totalTokens",
    "cachedPromptTokens",
    "estimatedCost",
    "chargedCredits",
    "avgLatencyMs",
  ] as const) {
    const value = nonNegativeNumber(data[key]);
    if (value !== undefined) result[key] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

export function parseTransactionsPayload(raw: unknown, limit = 250): OrvixUsageTransaction[] | undefined {
  const root = isRecord(raw) ? raw : undefined;
  if (!root) return undefined;
  const data = isRecord(root.data) ? root.data : root;
  if (!Array.isArray(data.transactions)) return undefined;
  const transactions = data.transactions
    .filter(isRecord)
    .map((entry): OrvixUsageTransaction => ({
      id: textValue(entry.id) ?? "",
      type: textValue(entry.type) ?? "unknown",
      ...(nonNegativeNumber(entry.amountMicrousd) === undefined
        ? {}
        : { amountMicrousd: nonNegativeNumber(entry.amountMicrousd) }),
      ...(textValue(entry.reason) === undefined ? {} : { reason: textValue(entry.reason) }),
      ...(textValue(entry.createdAt) === undefined ? {} : { createdAt: textValue(entry.createdAt) }),
      ...(isRecord(entry.metadata) ? { metadata: entry.metadata } : {}),
    }))
    .filter((entry) => entry.id !== "")
    .slice(0, Math.max(1, limit));
  return transactions.length ? transactions : undefined;
}

export function formatCreditsUsd(microusd: number | undefined, currency = "USD"): string {
  if (microusd === undefined) return "—";
  const value = microusd / 1_000_000;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

export function formatUsd(value: number | undefined): string {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

export function formatCompactTokens(value: number | undefined): string {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function toProviderUsagePayload(raw: Record<string, unknown>): ProviderUsagePayload {
  const promptTokens = finiteNumber(raw.prompt_tokens ?? raw.input_tokens);
  const completionTokens = finiteNumber(raw.completion_tokens ?? raw.output_tokens);
  const totalTokens =
    finiteNumber(raw.total_tokens) ??
    (promptTokens !== undefined && completionTokens !== undefined ? promptTokens + completionTokens : undefined);
  const promptDetails = isRecord(raw.prompt_tokens_details) ? raw.prompt_tokens_details : undefined;
  const completionDetails = isRecord(raw.completion_tokens_details) ? raw.completion_tokens_details : undefined;
  const cachedTokens = finiteNumber(promptDetails?.cached_tokens);
  const reasoningTokens = finiteNumber(completionDetails?.reasoning_tokens);
  return {
    ...(promptTokens === undefined ? {} : { prompt_tokens: promptTokens }),
    ...(completionTokens === undefined ? {} : { completion_tokens: completionTokens }),
    ...(totalTokens === undefined ? {} : { total_tokens: totalTokens }),
    ...(cachedTokens === undefined ? {} : { prompt_tokens_details: { cached_tokens: cachedTokens } }),
    ...(reasoningTokens === undefined
      ? {}
      : { completion_tokens_details: { reasoning_tokens: reasoningTokens } }),
  };
}

export interface ProviderUsagePayload {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens: number };
  completion_tokens_details?: { reasoning_tokens: number };
}

export function mergeUsageSnapshot(
  current: OrvixUsageSnapshot,
  update: OrvixUsageSnapshot,
): OrvixUsageSnapshot {
  return {
    ...current,
    ...update,
    credits: update.credits !== undefined ? { ...current.credits, ...update.credits } : current.credits,
    summary: update.summary !== undefined ? { ...current.summary, ...update.summary } : current.summary,
    transactions: update.transactions ?? current.transactions,
    lastRequest: update.lastRequest ?? current.lastRequest,
    tracked: update.tracked !== undefined ? { ...current.tracked, ...update.tracked } : current.tracked,
  };
}

export function recordApiRequestUsage(
  current: OrvixUsageSnapshot,
  raw: Record<string, unknown>,
  modelId: string,
  recordedAt = Date.now(),
): OrvixUsageSnapshot {
  const usage = toProviderUsagePayload(raw);
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const totalTokens = usage.total_tokens;
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens;
  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens;
  const lastRequest: ApiRequestUsage = {
    modelId,
    recordedAt,
    ...(promptTokens === undefined ? {} : { promptTokens }),
    ...(completionTokens === undefined ? {} : { completionTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(cachedTokens === undefined ? {} : { cachedTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
  };
  const previous = current.tracked;
  const tracked: TrackedApiUsage = {
    requests: (previous?.requests ?? 0) + 1,
    promptTokens: (previous?.promptTokens ?? 0) + (promptTokens ?? 0),
    completionTokens: (previous?.completionTokens ?? 0) + (completionTokens ?? 0),
    totalTokens: (previous?.totalTokens ?? 0) + (totalTokens ?? 0),
    cachedTokens: (previous?.cachedTokens ?? 0) + (cachedTokens ?? 0),
    reasoningTokens: (previous?.reasoningTokens ?? 0) + (reasoningTokens ?? 0),
    estimatedCostUsd: 0,
  };
  return mergeUsageSnapshot(current, { lastRequest, tracked, updatedAt: recordedAt });
}

export function formatUsageStatusBar(snapshot: OrvixUsageSnapshot): string {
  if (snapshot.credits?.availableMicrousd !== undefined) {
    return `$(credit-card) Orvix ${formatCreditsUsd(snapshot.credits.availableMicrousd, snapshot.credits.currency)}`;
  }
  if (snapshot.tracked?.requests) {
    return `$(graph) Orvix ${formatUsd(snapshot.tracked.estimatedCostUsd)}`;
  }
  if (snapshot.apiError) return "$(warning) Orvix unavailable";
  return "$(pulse) Orvix";
}

export function formatUsageTooltip(snapshot: OrvixUsageSnapshot): string {
  const lines = ["Orvix credits and API activity"];
  appendCreditsLines(lines, snapshot.credits);
  appendSummaryLines(lines, snapshot.summary);
  appendTrackedLines(lines, snapshot);
  if (snapshot.transactions?.length) lines.push(`Recent transactions: ${snapshot.transactions.length}`);
  if (!snapshot.credits && !snapshot.summary && !snapshot.tracked) lines.push("No live usage observed yet");
  if (snapshot.apiError) lines.push("Orvix usage API unavailable");
  if (snapshot.updatedAt) lines.push(`Updated ${new Date(snapshot.updatedAt).toLocaleString()}`);
  lines.push("Click for details");
  return lines.join("\n");
}

function appendCreditsLines(lines: string[], credits: OrvixCreditBalance | undefined): void {
  if (!credits) return;
  const { availableMicrousd, reservedMicrousd, currency } = credits;
  lines.push(
    `Available credits: ${formatCreditsUsd(availableMicrousd, currency)}`
    + (reservedMicrousd === undefined ? "" : ` (${formatCreditsUsd(reservedMicrousd, currency)} reserved)`),
  );
}

function appendSummaryLines(lines: string[], summary: OrvixUsageSummary | undefined): void {
  if (!summary) return;
  const { requests, totalTokens, estimatedCost, chargedCredits } = summary;
  if (requests !== undefined) lines.push(`Requests: ${requests.toLocaleString()}`);
  if (totalTokens !== undefined) lines.push(`Tokens: ${formatCompactTokens(totalTokens)}`);
  if (estimatedCost !== undefined) lines.push(`Estimated spend: ${formatUsd(estimatedCost)}`);
  if (chargedCredits !== undefined) lines.push(`Charged credits: ${formatUsd(chargedCredits)}`);
}

function appendTrackedLines(lines: string[], snapshot: OrvixUsageSnapshot): void {
  if (snapshot.tracked) {
    lines.push(
      `Tracked session: ${snapshot.tracked.requests.toLocaleString()} requests · `
      + `${formatCompactTokens(snapshot.tracked.totalTokens)} tokens`,
    );
  }
  if (snapshot.lastRequest) {
    lines.push(
      `Last request: ${snapshot.lastRequest.modelId} · ${formatCompactTokens(snapshot.lastRequest.totalTokens)} tokens`,
    );
  }
}

export interface UsageDisplayRow {
  kind: "credits" | "spend" | "request" | "requests" | "tokens" | "warning" | "empty";
  label: string;
  description: string;
  detail?: string;
}

export function formatUsageRows(snapshot: OrvixUsageSnapshot): UsageDisplayRow[] {
  const rows = [
    ...creditsRow(snapshot.credits),
    ...summaryRows(snapshot.summary),
    ...trackedRows(snapshot),
  ];
  if (rows.length) return rows;
  return [
    {
      kind: "empty",
      label: snapshot.apiError ? "Orvix usage unavailable" : "No live usage observed yet",
      description: snapshot.apiError ?? "Send a request or refresh to load credits",
    },
  ];
}

function creditsRow(credits: OrvixCreditBalance | undefined): UsageDisplayRow[] {
  if (!credits) return [];
  const { availableMicrousd, reservedMicrousd, currency } = credits;
  return [
    {
      kind: "credits",
      label: `Available credits: ${formatCreditsUsd(availableMicrousd, currency)}`,
      description: reservedMicrousd === undefined ? "Orvix project credits" : `${formatCreditsUsd(reservedMicrousd, currency)} reserved`,
    },
  ];
}

function summaryRows(summary: OrvixUsageSummary | undefined): UsageDisplayRow[] {
  if (!summary) return [];
  const { requests, totalTokens, estimatedCost } = summary;
  return [
    {
      kind: "requests",
      label: `Requests: ${(requests ?? 0).toLocaleString()}`,
      description: "Across all API keys (last 7 days)",
    },
    {
      kind: "tokens",
      label: `Tokens: ${formatCompactTokens(totalTokens)}`,
      description: "Prompt and completion tokens",
    },
    {
      kind: "spend",
      label: `Estimated spend: ${formatUsd(estimatedCost)}`,
      description: "Charged against credits or BYOK",
    },
  ];
}

function trackedRows(snapshot: OrvixUsageSnapshot): UsageDisplayRow[] {
  if (!snapshot.tracked) return [];
  return [
    {
      kind: "request",
      label: `Last request: ${snapshot.lastRequest?.modelId ?? "unknown"}`,
      description: snapshot.lastRequest
        ? `${formatCompactTokens(snapshot.lastRequest.totalTokens)} tokens · ${new Date(snapshot.lastRequest.recordedAt).toLocaleString()}`
        : "",
    },
    {
      kind: "requests",
      label: `Tracked session: ${snapshot.tracked.requests.toLocaleString()} requests`,
      description: `${formatCompactTokens(snapshot.tracked.totalTokens)} tokens since VS Code started`,
    },
  ];
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return finiteNumber(value);
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
