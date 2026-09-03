/** Orvix credits and request usage normalization for VS Code. */

/** A project's live Orvix credit balance, in micro-USD (1 credit = 1e-6 USD). */
export interface OrvixCreditBalance {
  /** Orvix project identifier. */
  projectId?: string;
  /** Display name of the project that owns the balance. */
  projectName?: string;
  /** ISO 4217 currency code; Orvix credits are denominated in `USD`. */
  currency?: string;
  /** Spendable balance in micro-USD. */
  availableMicrousd?: number;
  /** Balance already reserved for in-flight reservations in micro-USD. */
  reservedMicrousd?: number;
  /** Project billing status, e.g. `active`. */
  status?: string;
  /** ISO timestamp of the last balance update. */
  updatedAt?: string;
}

/** Aggregated Orvix gateway usage over a rolling window (default 7 days). */
export interface OrvixUsageSummary {
  requests?: number;
  errors?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedPromptTokens?: number;
  /** Estimated project spend in USD, covering both credits and BYOK. */
  estimatedCost?: number;
  /** USD value actually charged against Orvix credits. */
  chargedCredits?: number;
  avgLatencyMs?: number;
}

/** One immutable credit transaction (reservation, settlement, grant, …). */
export interface OrvixUsageTransaction {
  id: string;
  type: string;
  amountMicrousd?: number;
  reason?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

/** An active Orvix plan purchased with the IDR balance. */
export interface OrvixPlan {
  id: string;
  planName: string;
  unitsTotal?: number;
  unitsRemaining?: number;
  pricePaidIdr?: number;
  expiresAt?: string;
  createdAt?: string;
}

/** One IDR balance movement (top-up or plan purchase). */
export interface OrvixBalanceTransaction {
  id: string;
  type: "purchase" | "topup" | string;
  amountIdr?: number;
  balanceAfterIdr?: number;
  reason?: string;
  createdAt?: string;
}

/** A submitted IDR top-up payment. */
export interface OrvixTopUp {
  id: string;
  amountIdr?: number;
  paymentAmount?: number;
  status?: string;
  expiresAt?: string;
  createdAt?: string;
}

/** The rupiah account balance plus active plans, separate from USD credits. */
export interface OrvixAccountBalance {
  balanceIdr: number;
  plans?: OrvixPlan[];
  transactions?: OrvixBalanceTransaction[];
}

/** Token usage of the most recently recorded inference request. */
export interface ApiRequestUsage {
  modelId: string;
  recordedAt: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
}

/**
 * Running totals accumulated by {@link recordApiRequestUsage} for the current
 * VS Code session.
 */
export interface TrackedApiUsage {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  /** Placeholder that stays `0` until Orvix exposes per-request cost. */
  estimatedCostUsd: number;
}

/** Persisted usage state shown by the status bar and the usage quick pick. */
export interface OrvixUsageSnapshot {
  credits?: OrvixCreditBalance;
  transactions?: OrvixUsageTransaction[];
  summary?: OrvixUsageSummary;
  account?: OrvixAccountBalance;
  topUps?: OrvixTopUp[];
  lastRequest?: ApiRequestUsage;
  tracked?: TrackedApiUsage;
  /** Human-readable failure message from the last gateway refresh. */
  apiError?: string;
  updatedAt?: number;
}

/**
 * Parses a `GET /billing` response into a project credit balance.
 *
 * Accepts either the gateway envelope (`{ success, data: {...} }`) or a flat
 * payload, and drops entries that carry no usable fields.
 *
 * @example
 * parseBillingPayload({
 *   success: true,
 *   data: { currency: "USD", availableMicrousd: 250000, reservedMicrousd: 0 },
 * });
 * // => { availableMicrousd: 250000, reservedMicrousd: 0, currency: "USD" }
 *
 * @see {@link OrvixCreditBalance}
 */
export function parseBillingPayload(raw: unknown): OrvixCreditBalance | undefined {
  const root = isRecord(raw) ? raw : undefined;
  if (!root) return undefined;
  // Unwrap the gateway `{ success, data }` envelope; fall back to a flat payload.
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
  // A payload with no recognized field is treated as absent so callers can
  // distinguish "no balance" from a malformed response.
  const hasValue = result.availableMicrousd !== undefined
    || result.reservedMicrousd !== undefined
    || projectId !== undefined
    || projectName !== undefined
    || currency !== undefined
    || status !== undefined
    || updatedAt !== undefined;
  return hasValue ? result : undefined;
}

/**
 * Parses a `GET /usage/summary` response into a rolling usage summary.
 *
 * Unknown or non-numeric fields are ignored, so new gateway fields do not
 * break older versions of the extension.
 *
 * @example
 * parseUsageSummaryPayload({
 *   success: true,
 *   data: { requests: 202, totalTokens: 245337, estimatedCost: 0.289464 },
 * });
 * // => { requests: 202, totalTokens: 245337, estimatedCost: 0.289464 }
 *
 * @see {@link OrvixUsageSummary}
 */
export function parseUsageSummaryPayload(raw: unknown): OrvixUsageSummary | undefined {
  const root = isRecord(raw) ? raw : undefined;
  if (!root) return undefined;
  // Unwrap the gateway `{ success, data }` envelope; fall back to a flat payload.
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

/**
 * Parses a `GET /billing/transactions` response into a bounded credit history.
 *
 * Entries without an id, and payloads without a `transactions` array, are
 * dropped. The list is capped at `limit` (default 250) to keep the persisted
 * snapshot small.
 *
 * @example
 * parseTransactionsPayload({
 *   success: true,
 *   data: { transactions: [{ id: "txn_1", type: "promo credit", amountMicrousd: 500000 }] },
 * });
 * // => [{ id: "txn_1", type: "promo credit", amountMicrousd: 500000 }]
 *
 * @see {@link OrvixUsageTransaction}
 */
export function parseTransactionsPayload(raw: unknown, limit = 250): OrvixUsageTransaction[] | undefined {
  const root = isRecord(raw) ? raw : undefined;
  if (!root) return undefined;
  // Unwrap the gateway `{ success, data }` envelope; fall back to a flat payload.
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

/**
 * Parses a `GET /balance` response into the rupiah account balance.
 *
 * The rupiah balance is separate from USD provider credits (`/billing`). Returns
 * `undefined` when no `balanceIdr` is present.
 *
 * @example
 * parseAccountBalancePayload({
 *   success: true,
 *   data: {
 *     balanceIdr: 10000,
 *     plans: [{ id: "p1", planName: "Flame", unitsTotal: 12000000, unitsRemaining: 11693634 }],
 *     transactions: [{ id: "t1", type: "topup", amountIdr: 50000, balanceAfterIdr: 50000 }],
 *   },
 * });
 * // => { balanceIdr: 10000, plans: [...], transactions: [...] }
 *
 * @see {@link OrvixAccountBalance}, {@link parseTopUpsPayload}
 */
export function parseAccountBalancePayload(raw: unknown): OrvixAccountBalance | undefined {
  const root = isRecord(raw) ? raw : undefined;
  if (!root) return undefined;
  // Unwrap the gateway `{ success, data }` envelope; fall back to a flat payload.
  const data = isRecord(root.data) ? root.data : root;
  const balanceIdr = nonNegativeNumber(data.balanceIdr);
  if (balanceIdr === undefined) return undefined;
  const plans = Array.isArray(data.plans)
    ? data.plans.filter(isRecord).map((plan): OrvixPlan => ({
        id: textValue(plan.id) ?? "",
        planName: textValue(plan.planName) ?? "Plan",
        ...(nonNegativeNumber(plan.unitsTotal) === undefined ? {} : { unitsTotal: nonNegativeNumber(plan.unitsTotal) }),
        ...(nonNegativeNumber(plan.unitsRemaining) === undefined ? {} : { unitsRemaining: nonNegativeNumber(plan.unitsRemaining) }),
        ...(nonNegativeNumber(plan.pricePaidIdr) === undefined ? {} : { pricePaidIdr: nonNegativeNumber(plan.pricePaidIdr) }),
        ...(textValue(plan.expiresAt) === undefined ? {} : { expiresAt: textValue(plan.expiresAt) }),
        ...(textValue(plan.createdAt) === undefined ? {} : { createdAt: textValue(plan.createdAt) }),
      }))
      .filter((plan) => plan.id !== "")
    : undefined;
  const transactions = Array.isArray(data.transactions)
    ? data.transactions.filter(isRecord).map((entry): OrvixBalanceTransaction => ({
        id: textValue(entry.id) ?? "",
        type: textValue(entry.type) ?? "unknown",
        // amountIdr may be negative (a purchase spends from the balance).
        ...(signedNumber(entry.amountIdr) === undefined ? {} : { amountIdr: signedNumber(entry.amountIdr) }),
        ...(nonNegativeNumber(entry.balanceAfterIdr) === undefined ? {} : { balanceAfterIdr: nonNegativeNumber(entry.balanceAfterIdr) }),
        ...(textValue(entry.reason) === undefined ? {} : { reason: textValue(entry.reason) }),
        ...(textValue(entry.createdAt) === undefined ? {} : { createdAt: textValue(entry.createdAt) }),
      }))
      .filter((entry) => entry.id !== "")
    : undefined;
  return {
    balanceIdr,
    ...(plans?.length ? { plans } : {}),
    ...(transactions?.length ? { transactions } : {}),
  };
}

/**
 * Parses a `GET /balance/topups` response into a list of submitted top-ups.
 *
 * @example
 * parseTopUpsPayload({
 *   success: true,
 *   data: [{ id: "tu_1", amountIdr: 50000, status: "paid" }],
 * });
 * // => [{ id: "tu_1", amountIdr: 50000, status: "paid" }]
 *
 * @see {@link OrvixTopUp}, {@link parseAccountBalancePayload}
 */
export function parseTopUpsPayload(raw: unknown): OrvixTopUp[] | undefined {
  const root = isRecord(raw) ? raw : undefined;
  if (!root) return undefined;
  // Unwrap the gateway `{ success, data }` envelope; `data` may be an array.
  const data = isRecord(root.data) ? root.data : root;
  const list = Array.isArray(data) ? data : (Array.isArray(root.data) ? root.data : undefined);
  if (!list) return undefined;
  const topUps = list
    .filter(isRecord)
    .map((entry): OrvixTopUp => ({
      id: textValue(entry.id) ?? "",
      ...(nonNegativeNumber(entry.amountIdr) === undefined ? {} : { amountIdr: nonNegativeNumber(entry.amountIdr) }),
      ...(nonNegativeNumber(entry.paymentAmount) === undefined ? {} : { paymentAmount: nonNegativeNumber(entry.paymentAmount) }),
      ...(textValue(entry.status) === undefined ? {} : { status: textValue(entry.status) }),
      ...(textValue(entry.expiresAt) === undefined ? {} : { expiresAt: textValue(entry.expiresAt) }),
      ...(textValue(entry.createdAt) === undefined ? {} : { createdAt: textValue(entry.createdAt) }),
    }))
    .filter((entry) => entry.id !== "");
  return topUps.length ? topUps : undefined;
}

/**
 * Formats a micro-USD amount as a localized currency string.
 *
 * Orvix stores credits as micro-USD (1 credit = 1e-6 USD), so the value is
 * divided by 1,000,000 before formatting.
 *
 * @example
 * formatCreditsUsd(250000); // "$0.25"
 * formatCreditsUsd(undefined); // "—"
 *
 * @see {@link formatUsd}
 */
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

/**
 * Formats a USD amount from the usage summary as a localized currency string.
 *
 * @example
 * formatUsd(0.289464); // "$0.289464"
 * formatUsd(undefined); // "—"
 *
 * @see {@link formatCreditsUsd}
 */
export function formatUsd(value: number | undefined): string {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

/**
 * Formats a rupiah amount without decimals, e.g. `Rp10.000`.
 *
 * @example
 * formatIdr(10000); // "Rp10.000"
 * formatIdr(undefined); // "—"
 *
 * @see {@link formatUsd}
 */
export function formatIdr(value: number | undefined): string {
  if (value === undefined) return "—";
  return `Rp${value.toLocaleString("id-ID")}`;
}

/**
 * Formats a token count using compact notation (e.g. `245.3K`).
 *
 * @example
 * formatCompactTokens(245337); // "245.3K"
 * formatCompactTokens(undefined); // "—"
 */
export function formatCompactTokens(value: number | undefined): string {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/**
 * Normalizes an OpenAI-compatible usage object into the shape VS Code expects
 * from a `LanguageModelChatProvider` response.
 *
 * Accepts both `prompt_tokens`/`completion_tokens` and the Responses API
 * `input_tokens`/`output_tokens` names, and derives `total_tokens` when the
 * upstream omits it.
 *
 * @example
 * toProviderUsagePayload({ input_tokens: 8, output_tokens: 3 });
 * // => { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 }
 *
 * @see {@link ProviderUsagePayload}
 */
export function toProviderUsagePayload(raw: Record<string, unknown>): ProviderUsagePayload {
  const promptTokens = finiteNumber(raw.prompt_tokens ?? raw.input_tokens);
  const completionTokens = finiteNumber(raw.completion_tokens ?? raw.output_tokens);
  // Derive a total only when both sides are known; otherwise leave it absent.
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

/**
 * Merges a partial usage update into the current snapshot.
 *
 * Nested objects (`credits`, `summary`, `tracked`) are shallow-merged so a
 * refresh of one field never discards another; arrays and scalars are replaced
 * when the update provides them.
 *
 * @example
 * mergeUsageSnapshot(
 *   { credits: { availableMicrousd: 1000 } },
 *   { credits: { reservedMicrousd: 5 }, summary: { requests: 10 } },
 * );
 * // => { credits: { availableMicrousd: 1000, reservedMicrousd: 5 }, summary: { requests: 10 } }
 *
 * @see {@link OrvixUsageSnapshot}, {@link recordApiRequestUsage}
 */
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
    account: update.account !== undefined ? { ...current.account, ...update.account } : current.account,
    topUps: update.topUps ?? current.topUps,
    lastRequest: update.lastRequest ?? current.lastRequest,
    tracked: update.tracked !== undefined ? { ...current.tracked, ...update.tracked } : current.tracked,
  };
}

/**
 * Records one inference request into the snapshot and returns a new snapshot.
 *
 * Normalizes the raw OpenAI-compatible usage, stores it as `lastRequest`, and
 * accumulates the deltas into `tracked`. The snapshot is immutable: the input
 * is never mutated.
 *
 * @example
 * recordApiRequestUsage(
 *   {},
 *   { prompt_tokens: 140, completion_tokens: 2, total_tokens: 142 },
 *   "orvix/glm-5.3-flash",
 *   1000,
 * );
 * // => { lastRequest: { modelId: "orvix/glm-5.3-flash", recordedAt: 1000, ... },
 * //      tracked: { requests: 1, promptTokens: 140, completionTokens: 2, totalTokens: 142, ... },
 * //      updatedAt: 1000 }
 *
 * @see {@link toProviderUsagePayload}, {@link mergeUsageSnapshot}, {@link ApiRequestUsage}
 */
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
  // Accumulate each request's tokens onto the previous session totals.
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

/**
 * Renders the status-bar text for a usage snapshot.
 *
 * Prefers the live credit balance, then locally tracked session totals, then
 * falls back to an availability placeholder. When the gateway is unreachable,
 * the locally tracked request/token counts still render so the status bar is
 * never blanked.
 *
 * @example
 * formatUsageStatusBar({ credits: { availableMicrousd: 250000, currency: "USD" } });
 * // => "$(credit-card) Orvix $0.25"
 * formatUsageStatusBar({ tracked: { requests: 5, totalTokens: 150, ... } });
 * // => "$(graph) Orvix 5 req · 150 tok"
 *
 * @see {@link formatUsageTooltip}, {@link formatUsageRows}
 */
export function formatUsageStatusBar(snapshot: OrvixUsageSnapshot): string {
  if (snapshot.credits?.availableMicrousd !== undefined) {
    return `$(credit-card) Orvix ${formatCreditsUsd(snapshot.credits.availableMicrousd, snapshot.credits.currency)}`;
  }
  if (snapshot.account?.balanceIdr !== undefined) {
    return `$(credit-card) Orvix ${formatIdr(snapshot.account.balanceIdr)}`;
  }
  if (snapshot.tracked?.requests) {
    return `$(graph) Orvix ${snapshot.tracked.requests.toLocaleString()} req · ${formatCompactTokens(snapshot.tracked.totalTokens)} tok`;
  }
  if (snapshot.apiError) return "$(account) Orvix sign-in";
  return "$(pulse) Orvix";
}

/**
 * Builds the multi-line status-bar tooltip for a usage snapshot.
 *
 * @example
 * formatUsageTooltip({
 *   credits: { availableMicrousd: 250000 },
 *   summary: { requests: 202, totalTokens: 245337, estimatedCost: 0.289464 },
 * });
 * // => "Orvix credits and API activity\nAvailable credits: $0.25\nRequests: 202\n…"
 *
 * @see {@link formatUsageStatusBar}, {@link appendCreditsLines}
 */
export function formatUsageTooltip(snapshot: OrvixUsageSnapshot): string {
  const lines = ["Orvix credits and API activity"];
  appendCreditsLines(lines, snapshot.credits);
  appendAccountLines(lines, snapshot.account);
  appendSummaryLines(lines, snapshot.summary);
  appendTrackedLines(lines, snapshot);
  if (snapshot.transactions?.length) lines.push(`Recent transactions: ${snapshot.transactions.length}`);
  if (snapshot.topUps?.length) lines.push(`Top-ups: ${snapshot.topUps.length}`);
  if (snapshot.apiError) {
    lines.push("Gateway usage unavailable (browser sign-in required); showing local session tracking.");
    lines.push("Run Orvix: Import Usage Session to unlock credits and spend.");
  } else if (!snapshot.credits && !snapshot.summary && !snapshot.tracked) {
    lines.push("No live usage observed yet");
  }
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

function appendAccountLines(lines: string[], account: OrvixAccountBalance | undefined): void {
  if (!account) return;
  lines.push(`Balance: ${formatIdr(account.balanceIdr)}`);
  for (const plan of account.plans ?? []) {
    const used = plan.unitsTotal !== undefined && plan.unitsRemaining !== undefined
      ? ` · ${Math.round((plan.unitsRemaining / plan.unitsTotal) * 100)}% left`
      : "";
    lines.push(`Plan ${plan.planName}: ${formatCompactTokens(plan.unitsRemaining)}/${formatCompactTokens(plan.unitsTotal)} tokens${used}`);
  }
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
  kind: "credits" | "spend" | "request" | "requests" | "tokens" | "balance" | "plan" | "warning" | "session" | "empty";
  label: string;
  description: string;
  detail?: string;
}

/**
 * Converts a usage snapshot into quick-pick rows for the usage command.
 *
 * Locally tracked request/token rows are always shown when present. When the
 * gateway is unavailable (e.g. a 401 because the API key is inferencing-only),
 * a warning row explains the limitation and an explicit **Import usage session**
 * action hints at the fix, falling back to a single empty row only if nothing
 * has been observed yet, so the quick pick is never blank.
 *
 * @example
 * formatUsageRows({ credits: { availableMicrousd: 250000 } });
 * // => [{ kind: "credits", label: "Available credits: $0.25", description: "Orvix project credits" }]
 * formatUsageRows({ account: { balanceIdr: 10000, plans: [{ planName: "Flame", ... }] } });
 * // => [{ kind: "balance", label: "Balance: Rp10.000", ... }, { kind: "plan", label: "Plan Flame: 11.7M/12M tokens", ... }]
 *
 * @see {@link UsageDisplayRow}, {@link formatUsageStatusBar}
 */
export function formatUsageRows(snapshot: OrvixUsageSnapshot): UsageDisplayRow[] {
  const rows = [
    ...creditsRow(snapshot.credits),
    ...accountRows(snapshot.account),
    ...summaryRows(snapshot.summary),
    ...trackedRows(snapshot),
    ...warningRow(snapshot),
    ...sessionRow(snapshot),
  ];
  if (rows.length) return rows;
  return [
    {
      kind: "empty",
      label: "No live usage observed yet",
      description: "Send a request or refresh to load credits",
    },
  ];
}

/** Builds the gateway-unavailable warning row, if any. @see {@link formatUsageRows} */
function warningRow(snapshot: OrvixUsageSnapshot): UsageDisplayRow[] {
  if (!snapshot.apiError) return [];
  return [
    {
      kind: "warning",
      label: "Orvix usage unavailable",
      description: snapshot.apiError,
    },
  ];
}

/** Builds an "import a browser session" hint row when the gateway is unreachable. @see {@link formatUsageRows} */
function sessionRow(snapshot: OrvixUsageSnapshot): UsageDisplayRow[] {
  if (!snapshot.apiError) return [];
  return [
    {
      kind: "session",
      label: "Import usage session",
      description: "Select to paste a browser session and unlock credits/usage",
    },
  ];
}

/** Builds rupiah balance and active-plan rows, if any. @see {@link formatUsageRows} */
function accountRows(account: OrvixAccountBalance | undefined): UsageDisplayRow[] {
  if (!account) return [];
  const rows: UsageDisplayRow[] = [
    {
      kind: "balance",
      label: `Balance: ${formatIdr(account.balanceIdr)}`,
      description: "IDR account balance (separate from USD credits)",
    },
  ];
  for (const plan of account.plans ?? []) {
    const tokens = plan.unitsTotal !== undefined
      ? `${formatCompactTokens(plan.unitsRemaining)}/${formatCompactTokens(plan.unitsTotal)} tokens`
      : `${formatCompactTokens(plan.unitsRemaining)} tokens`;
    rows.push({
      kind: "plan",
      label: `Plan ${plan.planName}: ${tokens}`,
      description: plan.expiresAt ? `Expires ${new Date(plan.expiresAt).toLocaleDateString()}` : "Active plan",
    });
  }
  return rows;
}

/** Builds the USD credit-balance quick-pick row, if any. @see {@link formatUsageRows} */
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

/** Like {@link finiteNumber} but allows negative values (e.g. balance spends). */
function signedNumber(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
