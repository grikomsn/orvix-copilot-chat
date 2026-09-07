export interface ModelCost {
  readonly input: number;
  readonly output: number;
  readonly cacheRead?: number;
}

export interface ModelPricingFields {
  readonly pricing: string;
  readonly inputCost: number;
  readonly outputCost: number;
  readonly cacheCost?: number;
  readonly priceCategory: "low" | "medium" | "high" | "very_high";
}

/**
 * Best-effort USD per-1M-token costs for Orvix managed models, derived from
 * their upstream provider pricing (via models.dev). Orvix does not disclose
 * per-token rates on its model endpoint, so these are used only when live
 * pricing is absent, and are treated as estimates rather than authoritative
 * Orvix billing.
 */
const MANAGED_MODEL_UPSTREAM_COST: Readonly<Record<string, ModelCost>> = {
  "orvix/muse-spark-1.2": { input: 1.25, output: 4.25, cacheRead: 0.15 },
  "orvix/muse-spark-1.3": { input: 1.25, output: 4.25, cacheRead: 0.15 },
  "orvix/mimo-v2.5": { input: 0.14, output: 0.28, cacheRead: 0.0028 },
  "orvix/mimo-v2.5-pro": { input: 0.435, output: 0.87, cacheRead: 0.0036 },
  "orvix/glm-5.2": { input: 1.4, output: 4.4, cacheRead: 0.26 },
  "orvix/glm-5.3-flash": { input: 0.075, output: 0.25, cacheRead: 0.015 },
  "orvix/gpt-5.6-luna": { input: 0.2, output: 1.2, cacheRead: 0.02 },
  "orvix/gpt-5.6-sol": { input: 4, output: 20, cacheRead: 0.4 },
  "orvix/gpt-5.6-terra": { input: 2, output: 12, cacheRead: 0.2 },
  "orvix/grok-4.6": { input: 2, output: 6, cacheRead: 0.5 },
  "orvix/deepseek-v4-flash": { input: 0.14, output: 0.28, cacheRead: 0.0028 },
  "orvix/deepseek-v4-pro": { input: 0.435, output: 0.87, cacheRead: 0.003625 },
  "orvix/gemini-3.7-flash": { input: 0.75, output: 3.75, cacheRead: 0.075 },
  "orvix/gemini-3.8-flash": { input: 0.75, output: 3.75, cacheRead: 0.075 },
  "orvix/minimax-m3": { input: 0.3, output: 1.2, cacheRead: 0.06 },
  "orvix/qwen-3.8-flash": { input: 0.16, output: 0.47, cacheRead: 0.016 },
  "orvix/qwen-3.8-max": { input: 2, output: 6, cacheRead: 0.25 },
  "orvix/kimi-k3": { input: 3, output: 15, cacheRead: 0.3 },
};

/**
 * Resolves a model's per-token cost.
 *
 * Prefers live pricing from the Orvix model API when the provider discloses it;
 * otherwise falls back to the best-effort upstream estimate for managed models
 * (see {@link MANAGED_MODEL_UPSTREAM_COST}).
 */
export function orvixModelCost(id: string, discovered?: ModelCost): ModelCost | undefined {
  return discovered ?? MANAGED_MODEL_UPSTREAM_COST[id.trim().toLowerCase()];
}

export function modelCostFromApi(value: unknown): ModelCost | undefined {
  const pricing = record(value);
  if (!pricing) return undefined;
  const input = nonNegativeNumber(pricing.prompt);
  const output = nonNegativeNumber(pricing.completion);
  if (input === undefined || output === undefined) return undefined;
  const cacheRead = nonNegativeNumber(pricing.cache_prompt);
  return {
    input: perMillion(input),
    output: perMillion(output),
    ...(cacheRead === undefined ? {} : { cacheRead: perMillion(cacheRead) }),
  };
}

export function modelPricingFields(cost: ModelCost | undefined): ModelPricingFields | undefined {
  if (!cost) return undefined;
  if (cost.input === 0 && cost.output === 0) {
    return {
      pricing: "Free",
      inputCost: 0,
      outputCost: 0,
      ...(cost.cacheRead === undefined ? {} : { cacheCost: 0 }),
      priceCategory: "low",
    };
  }
  return {
    pricing: `In: $${formatPrice(cost.input)} · Out: $${formatPrice(cost.output)} /1M tokens`,
    inputCost: Math.round(cost.input * 100),
    outputCost: Math.round(cost.output * 100),
    ...(cost.cacheRead === undefined ? {} : { cacheCost: Math.round(cost.cacheRead * 100) }),
    priceCategory: costCategory(cost),
  };
}

export function costCategory(cost: Pick<ModelCost, "input" | "output">): ModelPricingFields["priceCategory"] {
  const weighted = cost.input * 3 + cost.output;
  if (weighted <= 2) return "low";
  if (weighted <= 25) return "medium";
  if (weighted <= 50) return "high";
  return "very_high";
}

function formatPrice(value: number): string {
  return value.toFixed(6).replace(/\.?0+$/, "");
}

function perMillion(value: number): number {
  return Number((value * 1_000_000).toFixed(6));
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}
