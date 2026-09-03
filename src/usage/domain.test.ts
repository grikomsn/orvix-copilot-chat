import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCompactTokens,
  formatCreditsUsd,
  formatUsageRows,
  formatUsageStatusBar,
  formatUsageTooltip,
  formatUsd,
  mergeUsageSnapshot,
  parseBillingPayload,
  parseTransactionsPayload,
  parseUsageSummaryPayload,
  recordApiRequestUsage,
  toProviderUsagePayload,
} from "./domain";

test("normalizes Orvix OpenAI-compatible usage for VS Code", () => {
  assert.deepEqual(
    toProviderUsagePayload({
      prompt_tokens: 140,
      completion_tokens: 2,
      total_tokens: 142,
      prompt_tokens_details: { cached_tokens: 64 },
      completion_tokens_details: { reasoning_tokens: 1 },
    }),
    {
      prompt_tokens: 140,
      completion_tokens: 2,
      total_tokens: 142,
      prompt_tokens_details: { cached_tokens: 64 },
      completion_tokens_details: { reasoning_tokens: 1 },
    },
  );
});

test("accepts alternate token names and derives totals", () => {
  assert.deepEqual(toProviderUsagePayload({ input_tokens: 8, output_tokens: 3 }), {
    prompt_tokens: 8,
    completion_tokens: 3,
    total_tokens: 11,
  });
});

test("parses billing payload with micro-USD credits", () => {
  assert.deepEqual(
    parseBillingPayload({
      success: true,
      data: {
        projectId: "01M19YDNAHCF3N0QY0014209JR",
        projectName: "Default Project",
        currency: "USD",
        availableMicrousd: 0,
        reservedMicrousd: 0,
        status: "active",
        updatedAt: "2026-08-30T18:20:31.935Z",
      },
    }),
    {
      projectId: "01M19YDNAHCF3N0QY0014209JR",
      projectName: "Default Project",
      currency: "USD",
      availableMicrousd: 0,
      reservedMicrousd: 0,
      status: "active",
      updatedAt: "2026-08-30T18:20:31.935Z",
    },
  );
});

test("parses top-level billing payload without envelope", () => {
  assert.deepEqual(parseBillingPayload({ availableMicrousd: 250000, currency: "USD" }), {
    availableMicrousd: 250000,
    reservedMicrousd: undefined,
    currency: "USD",
  });
});

test("ignores malformed billing payloads", () => {
  assert.equal(parseBillingPayload({ success: true, data: null }), undefined);
  assert.equal(parseBillingPayload(undefined), undefined);
  assert.equal(parseBillingPayload("nope"), undefined);
});

test("parses usage summary payload", () => {
  assert.deepEqual(
    parseUsageSummaryPayload({
      success: true,
      data: {
        requests: 202,
        errors: 22,
        promptTokens: 220223,
        completionTokens: 25114,
        totalTokens: 245337,
        cachedPromptTokens: 71462,
        estimatedCost: 0.289464,
        chargedCredits: 0,
        avgLatencyMs: 3966,
      },
    }),
    {
      requests: 202,
      errors: 22,
      promptTokens: 220223,
      completionTokens: 25114,
      totalTokens: 245337,
      cachedPromptTokens: 71462,
      estimatedCost: 0.289464,
      chargedCredits: 0,
      avgLatencyMs: 3966,
    },
  );
});

test("ignores unknown usage summary keys", () => {
  assert.deepEqual(parseUsageSummaryPayload({ success: true, data: { requests: 1, extra: 99 } }), {
    requests: 1,
  });
  assert.equal(parseUsageSummaryPayload({ success: false, data: null }), undefined);
  assert.equal(parseUsageSummaryPayload([]), undefined);
});

test("parses transactions payload and caps the list", () => {
  const raw = {
    success: true,
    data: {
      transactions: [
        {
          id: "txn_1",
          type: "promo credit",
          amountMicrousd: 500000,
          reason: "Promo code ORVIX10",
          createdAt: "2026-08-01T00:00:00.000Z",
          metadata: { promoCode: "ORVIX10" },
        },
        { id: "txn_2", type: "settlement" },
        { id: "", type: "release" },
      ],
      total: 3,
    },
  };
  assert.deepEqual(parseTransactionsPayload(raw), [
    {
      id: "txn_1",
      type: "promo credit",
      amountMicrousd: 500000,
      reason: "Promo code ORVIX10",
      createdAt: "2026-08-01T00:00:00.000Z",
      metadata: { promoCode: "ORVIX10" },
    },
    { id: "txn_2", type: "settlement" },
  ]);
});

test("caps transactions to the given limit", () => {
  const raw = {
    data: {
      transactions: [
        { id: "a", type: "grant" },
        { id: "b", type: "grant" },
        { id: "c", type: "grant" },
      ],
    },
  };
  assert.equal(parseTransactionsPayload(raw, 2)?.length, 2);
  assert.equal(parseTransactionsPayload({ data: { transactions: [] } }), undefined);
  assert.equal(parseTransactionsPayload({ data: {} }), undefined);
});

test("records per-request usage and accumulates tracked totals", () => {
  const raw = {
    prompt_tokens: 140,
    completion_tokens: 2,
    total_tokens: 142,
    prompt_tokens_details: { cached_tokens: 64 },
    completion_tokens_details: { reasoning_tokens: 1 },
  };
  const first = recordApiRequestUsage({}, raw, "orvix/glm-5.3-flash", 1000);
  assert.ok(first.lastRequest);
  assert.equal(first.lastRequest?.modelId, "orvix/glm-5.3-flash");
  assert.equal(first.lastRequest?.recordedAt, 1000);
  assert.equal(first.lastRequest?.totalTokens, 142);
  assert.equal(first.tracked?.requests, 1);
  assert.equal(first.tracked?.totalTokens, 142);
  assert.equal(first.tracked?.cachedTokens, 64);
  assert.equal(first.tracked?.reasoningTokens, 1);

  const second = recordApiRequestUsage(first, { input_tokens: 50, output_tokens: 50 }, "orvix/gpt-5.6-luna", 2000);
  assert.equal(second.tracked?.requests, 2);
  assert.equal(second.tracked?.promptTokens, 140 + 50);
  assert.equal(second.tracked?.completionTokens, 2 + 50);
  assert.equal(second.tracked?.totalTokens, 142 + 100);
  assert.equal(second.lastRequest?.modelId, "orvix/gpt-5.6-luna");
});

test("merges snapshots while preserving missing nested state", () => {
  const a = {
    credits: { availableMicrousd: 1000, currency: "USD" },
    summary: { requests: 10 },
    tracked: { requests: 1, promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, reasoningTokens: 0, estimatedCostUsd: 0 },
    updatedAt: 1000,
  };
  const b = {
    credits: { reservedMicrousd: 5, status: "active" },
    summary: { totalTokens: 500 },
    lastRequest: { modelId: "m", recordedAt: 2000 },
  };
  const merged = mergeUsageSnapshot(a, b);
  assert.equal(merged.credits?.availableMicrousd, 1000);
  assert.equal(merged.credits?.reservedMicrousd, 5);
  assert.equal(merged.credits?.status, "active");
  assert.equal(merged.summary?.requests, 10);
  assert.equal(merged.summary?.totalTokens, 500);
  assert.equal(merged.lastRequest?.modelId, "m");
  assert.equal(merged.tracked?.requests, 1);
});

test("formats credit balances and spend", () => {
  assert.equal(formatCreditsUsd(0), "$0.00");
  assert.equal(formatCreditsUsd(250000), "$0.25");
  assert.equal(formatUsd(0.289464), "$0.289464");
  assert.equal(formatUsd(undefined), "—");
  assert.equal(formatCompactTokens(245337), "245.3K");
});

test("builds status bar, tooltip, and quick-pick rows", () => {
  const snapshot = {
    credits: { availableMicrousd: 250000, reservedMicrousd: 0, currency: "USD" },
    summary: { requests: 202, totalTokens: 245337, estimatedCost: 0.289464, chargedCredits: 0 },
    tracked: {
      requests: 5,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      cachedTokens: 10,
      reasoningTokens: 2,
      estimatedCostUsd: 0,
    },
    lastRequest: { modelId: "orvix/glm-5.3-flash", recordedAt: 1000, totalTokens: 30 },
    updatedAt: 1000,
  };
  assert.match(formatUsageStatusBar(snapshot), /\$0\.25/);
  assert.match(formatUsageTooltip(snapshot), /Available credits: \$0\.25/);
  assert.match(formatUsageTooltip(snapshot), /Requests: 202/);
  const rows = formatUsageRows(snapshot);
  assert.ok(rows.some((row) => row.kind === "credits" && row.label.includes("$0.25")));
  assert.ok(rows.some((row) => row.kind === "requests" && row.label.includes("202")));
  assert.ok(rows.some((row) => row.kind === "spend" && row.label.includes("0.289464")));
  assert.ok(rows.some((row) => row.kind === "request" && row.label.includes("orvix/glm-5.3-flash")));
});

test("handles empty snapshots in display helpers", () => {
  assert.equal(formatUsageStatusBar({}), "$(pulse) Orvix");
  assert.equal(formatUsageStatusBar({ apiError: "boom" }), "$(warning) Orvix unavailable");
  assert.equal(formatUsageRows({})[0].kind, "empty");
});
