import type { OrvixModelMetadata } from "./catalog";

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ThinkingProfile {
  readonly values: readonly ReasoningEffort[];
  readonly defaultValue: ReasoningEffort;
}

type ModelIdentity = Pick<OrvixModelMetadata, "id" | "reasoningEffort">;

const MUSE_PROFILE: ThinkingProfile = {
  values: ["minimal", "low", "medium", "high", "xhigh"],
  defaultValue: "high",
};

const GPT_56_LUNA_PROFILE: ThinkingProfile = {
  values: ["none", "low", "medium", "high", "xhigh", "max"],
  defaultValue: "high",
};
const DEEPSEEK_V4_PRO_PROFILE: ThinkingProfile = {
  values: ["none", "low", "high", "max"],
  defaultValue: "high",
};
const GLM_52_PROFILE: ThinkingProfile = {
  values: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
  defaultValue: "high",
};
const GPT_56_SOL_TERRA_PROFILE: ThinkingProfile = {
  values: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
  defaultValue: "high",
};

const THINKING_PROFILES = new Map<string, ThinkingProfile>([
  ["orvix/muse-spark-1.2", MUSE_PROFILE],
  ["orvix/muse-spark-1.3", MUSE_PROFILE],
  ["orvix/deepseek-v4-pro", DEEPSEEK_V4_PRO_PROFILE],
  ["orvix/glm-5.2", GLM_52_PROFILE],
  ["orvix/gpt-5.6-luna", GPT_56_LUNA_PROFILE],
  ["orvix/gpt-5.6-sol", GPT_56_SOL_TERRA_PROFILE],
  ["orvix/gpt-5.6-terra", GPT_56_SOL_TERRA_PROFILE],
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
  // providers. The per-model profile limits this to documented semantic values.
  return { ...body, reasoning_effort: effort };
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    typeof value === "string" &&
    (value === "none" ||
      value === "minimal" ||
      value === "low" ||
      value === "medium" ||
      value === "high" ||
      value === "xhigh" ||
      value === "max")
  );
}

function label(value: ReasoningEffort): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function description(value: ReasoningEffort): string {
  switch (value) {
    case "none":
      return "Disable reasoning for the fastest response";
    case "minimal":
      return "Use minimal reasoning for the fastest, cheapest responses";
    case "low":
      return "Use less reasoning for lower latency and cost";
    case "medium":
      return "Balance reasoning depth, latency, and cost";
    case "high":
      return "Use deeper reasoning for complex tasks";
    case "xhigh":
      return "Use extra-high reasoning for especially difficult tasks";
    case "max":
      return "Use the model's maximum reasoning effort";
  }
}

function stringOption(value: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  return typeof value?.[key] === "string" ? (value[key] as string) : undefined;
}
