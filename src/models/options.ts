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

/**
 * Model ids whose verified thinking profile includes the "none" value, i.e.
 * models that can run a genuine no-reasoning inline completion. Used by the
 * inline-suggestions model picker so newly verified profiles appear without
 * duplicating the list.
 *
 * @example
 * ```ts
 * inlineCompatibleModelIds(); // ["orvix/deepseek-v4-pro", "orvix/gpt-5.6-luna", …]
 * ```
 *
 * @see {@link THINKING_PROFILES}
 */
export function inlineCompatibleModelIds(): string[] {
  return [...THINKING_PROFILES.entries()]
    .filter(([, profile]) => profile.values.includes("none"))
    .map(([id]) => id);
}

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

/** A selectable context window tier shown on a model's picker configuration. */
export interface ContextSizeOption {
  /** Context cap in input tokens; 0 selects the model's default handling. */
  readonly value: number;
  /** Short picker label, e.g. "Auto", "128K", or "Maximum". */
  readonly label: string;
  /** Picker description for the tier. */
  readonly description: string;
}

/** Fixed context tiers offered below a model's registered input limit. */
const CONTEXT_SIZE_TIERS: readonly { value: number; label: string }[] = [
  { value: 65_536, label: "64K" },
  { value: 131_072, label: "128K" },
  { value: 200_000, label: "200K" },
];

/** Builds the context window tiers offered for a model's input limit; undefined when no tier fits. */
export function contextSizeOptions(maxInputTokens: number): ContextSizeOption[] | undefined {
  if (!Number.isFinite(maxInputTokens) || maxInputTokens <= CONTEXT_SIZE_TIERS[0].value) return undefined;
  const tiers = CONTEXT_SIZE_TIERS.filter((tier) => tier.value < maxInputTokens);
  if (!tiers.length) return undefined;
  return [
    { value: 0, label: "Auto", description: "Default context handling for this model." },
    ...tiers.map((tier) => ({
      value: tier.value,
      label: tier.label,
      description: `Keep the conversation under ${tier.label} input tokens.`,
    })),
    {
      value: maxInputTokens,
      label: "Maximum",
      description: "Use the model's full available input limit.",
    },
  ];
}

/** Resolves the effective context cap for a request; Auto and Maximum return undefined. */
export function resolveContextCap(contextSize: number, maxInputTokens: number): number | undefined {
  if (!Number.isFinite(contextSize) || contextSize <= 0) return undefined;
  if (!Number.isFinite(maxInputTokens) || maxInputTokens <= 0) return undefined;
  const cap = Math.min(Math.floor(contextSize), maxInputTokens);
  return cap < maxInputTokens ? cap : undefined;
}

/** Reads the opted-in context size from picker configuration; 0 keeps the model's default handling. */
export function resolveContextSize(configuration: Readonly<Record<string, unknown>> | undefined): number {
  const value = configuration?.contextSize;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Combines the model's thinking controls with an optional Context Window control. */
export function buildModelConfigurationSchema(
  model: ModelIdentity,
  contextOptions: readonly ContextSizeOption[] | undefined,
): { type: "object"; properties: Record<string, Record<string, unknown>> } | undefined {
  const thinking = buildThinkingSchema(model);
  if (!thinking && !contextOptions) return undefined;
  return {
    type: "object",
    properties: {
      ...(thinking?.properties ?? {}),
      ...(contextOptions ? {
        contextSize: {
          type: "number",
          title: "Context Window",
          enum: contextOptions.map((option) => option.value),
          enumItemLabels: contextOptions.map((option) => option.label),
          enumDescriptions: contextOptions.map((option) => option.description),
          default: 0,
          group: "navigation",
        },
      } : {}),
    },
  };
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
