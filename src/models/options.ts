import type { OrvixModelMetadata } from "./catalog";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "max";

export interface ThinkingProfile {
  readonly values: readonly ReasoningEffort[];
  readonly defaultValue: ReasoningEffort;
}

type ModelIdentity = Pick<OrvixModelMetadata, "id" | "reasoningEffort">;

const FULL_PROFILE: ThinkingProfile = {
  values: ["minimal", "low", "medium", "high", "max"],
  defaultValue: "high",
};

// Verified against the live Orvix API (2026-09-03): Orvix forwards
// reasoning_effort to the upstream provider, so models reject values their
// upstream does not support (surfaced as HTTP 502 with no JSON body).
// "none" is rejected on every model — use thinking:{"type":"disabled"} for off.
const GLM_53_FLASH_PROFILE: ThinkingProfile = {
  values: ["low", "high"],
  defaultValue: "high",
};
const GPT_56_LUNA_PROFILE: ThinkingProfile = {
  values: ["low", "medium", "high", "max"],
  defaultValue: "high",
};

const THINKING_PROFILES = new Map<string, ThinkingProfile>([
  ["orvix/auto", FULL_PROFILE],
  ["orvix/muse-spark-1.2", FULL_PROFILE],
  ["orvix/muse-spark-1.3", FULL_PROFILE],
  ["orvix/deepseek-v4-flash", FULL_PROFILE],
  ["orvix/deepseek-v4-pro", FULL_PROFILE],
  ["orvix/gemini-3.7-flash", FULL_PROFILE],
  ["orvix/glm-5.3-flash", GLM_53_FLASH_PROFILE],
  ["orvix/gpt-5.6-luna", GPT_56_LUNA_PROFILE],
  ["orvix/kimi-k3", FULL_PROFILE],
  ["orvix/minimax-m3", FULL_PROFILE],
  ["orvix/qwen-3.8-max", FULL_PROFILE],
]);

export function buildThinkingSchema(model: ModelIdentity): {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
} | undefined {
  if (!model.reasoningEffort) return undefined;
  const profile = THINKING_PROFILES.get(model.id);
  if (!profile) return undefined;
  return {
    type: "object",
    properties: {
      reasoningEffort: {
        type: "string",
        title: "Reasoning Effort",
        enum: [...profile.values],
        enumItemLabels: profile.values.map(label),
        enumDescriptions: profile.values.map(description),
        default: profile.defaultValue,
        group: "navigation",
      },
    },
  };
}

export function resolveEffortValue(
  model: ModelIdentity,
  configuration: Readonly<Record<string, unknown>> | undefined,
  workspaceDefault: unknown,
): ReasoningEffort | undefined {
  if (!model.reasoningEffort) return undefined;
  const profile = THINKING_PROFILES.get(model.id);
  if (!profile) return undefined;
  const requested =
    stringOption(configuration, "reasoningEffort") ??
    stringOption(configuration, "thinkingEffort") ??
    (typeof workspaceDefault === "string" ? workspaceDefault : undefined);
  return isReasoningEffort(requested) && profile.values.includes(requested)
    ? requested
    : profile.defaultValue;
}

export function applyReasoningEffort(
  body: Readonly<Record<string, unknown>>,
  effort: ReasoningEffort,
): Record<string, unknown> {
  // Orvix forwards OpenAI-compatible reasoning_effort values to upstream
  // providers. Verified against the live API: "none" is rejected with HTTP
  // 502 on every model, so the lowest exposed value is "minimal".
  return { ...body, reasoning_effort: effort };
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    typeof value === "string" &&
    (value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "max")
  );
}

function label(value: ReasoningEffort): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function description(value: ReasoningEffort): string {
  switch (value) {
    case "minimal":
      return "Use minimal reasoning for the fastest, cheapest responses";
    case "low":
      return "Use less reasoning for lower latency and cost";
    case "medium":
      return "Balance reasoning depth, latency, and cost";
    case "high":
      return "Use deeper reasoning for complex tasks";
    case "max":
      return "Use the model's maximum reasoning effort";
  }
}

function stringOption(value: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  return typeof value?.[key] === "string" ? (value[key] as string) : undefined;
}
