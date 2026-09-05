import { orvixModelCost, modelCostFromApi, type ModelCost } from "./pricing";
import type { ModelsDevModelMetadata } from "./metadata";

export const FALLBACK_MODELS = ["orvix/auto", "orvix/muse-spark-1.2"] as const;

export const DEFAULT_MAX_INPUT_TOKENS = 32_768;
export const DEFAULT_MAX_OUTPUT_TOKENS = 4_096;

export interface OrvixModelMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly contextLength: number;
  readonly maxOutputTokens: number;
  readonly imageInput: boolean;
  readonly toolCalling: boolean;
  readonly reasoningEffort: boolean;
  readonly description?: string;
  readonly releaseDate?: string;
  readonly ownedBy?: string;
  readonly cost?: ModelCost;
}

export interface OrvixApiModel {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly version?: unknown;
  readonly context_length?: unknown;
  readonly max_context_tokens?: unknown;
  readonly max_model_len?: unknown;
  readonly max_output_tokens?: unknown;
  readonly max_completion_tokens?: unknown;
  readonly input_modalities?: unknown;
  readonly architecture?: unknown;
  readonly capabilities?: unknown;
  readonly pricing?: unknown;
  readonly tool_calling?: unknown;
  readonly tool_call?: unknown;
  readonly description?: unknown;
  readonly created?: unknown;
  readonly owned_by?: unknown;
}

const MANAGED_MODEL_NAMES = new Map<string, string>([
  ["orvix/auto", "Orvix Auto"],
  ["orvix/muse-spark-1.2", "Muse Spark 1.2"],
  ["orvix/muse-spark-1.3", "Muse Spark 1.3"],
  ["orvix/mimo-v2.5", "MiMo-V2.5"],
  ["orvix/mimo-v2.5-pro", "MiMo-V2.5-Pro"],
  ["orvix/glm-5.2", "GLM 5.2"],
  ["orvix/glm-5.3-flash", "GLM 5.3 Flash"],
  ["orvix/gpt-5.6-luna", "GPT-5.6 Luna"],
  ["orvix/gpt-5.6-sol", "GPT-5.6 Sol"],
  ["orvix/gpt-5.6-terra", "GPT-5.6 Terra"],
  ["orvix/grok-4.6", "Grok 4.6"],
  ["orvix/deepseek-v4-flash", "DeepSeek V4 Flash"],
  ["orvix/deepseek-v4-pro", "DeepSeek V4 Pro"],
  ["orvix/gemini-3.7-flash", "Gemini 3.7 Flash"],
  ["orvix/gemini-3.8-flash", "Gemini 3.8 Flash"],
  ["orvix/minimax-m3", "MiniMax M3"],
  ["orvix/qwen-3.8-flash", "Qwen 3.8 Flash"],
  ["orvix/qwen-3.8-max", "Qwen 3.8 Max"],
  ["orvix/kimi-k3", "Kimi K3"],
]);

// The fallback catalogue mirrors Orvix's enforced per-request ceilings and
// route capabilities. Live nested capabilities override these values.
const MANAGED_MODEL_METADATA = new Map<string, OrvixModelMetadata>([
  modelEntry("orvix/auto", 450_000, 16_384),
  modelEntry("orvix/muse-spark-1.2", 450_000, 80_000, true, true, true),
  modelEntry("orvix/muse-spark-1.3", 450_000, 80_000, true, true, true),
  modelEntry("orvix/mimo-v2.5", 450_000, 128_000, true, true),
  modelEntry("orvix/mimo-v2.5-pro", 450_000, 128_000, false, true),
  modelEntry("orvix/glm-5.2", 450_000, 32_768, false, true, true),
  modelEntry("orvix/glm-5.3-flash", 450_000, 131_072),
  modelEntry("orvix/gpt-5.6-luna", 450_000, 128_000, true, true, true),
  modelEntry("orvix/gpt-5.6-sol", 450_000, 128_000, true, true, true),
  modelEntry("orvix/gpt-5.6-terra", 450_000, 128_000, true, true, true),
  modelEntry("orvix/grok-4.6", 450_000, 32_768, true, true),
  modelEntry("orvix/deepseek-v4-flash", 450_000, 384_000, false, true),
  modelEntry("orvix/deepseek-v4-pro", 450_000, 384_000, false, true, true),
  modelEntry("orvix/gemini-3.7-flash", 450_000, 32_000, true, true),
  modelEntry("orvix/gemini-3.8-flash", 450_000, 32_000, true, true),
  modelEntry("orvix/minimax-m3", 450_000, 32_768, false, true),
  modelEntry("orvix/qwen-3.8-flash", 450_000, 65_536, false, true),
  modelEntry("orvix/qwen-3.8-max", 450_000, 32_768, true, true),
  modelEntry("orvix/kimi-k3", 450_000, 16_384, false, true),
]);

export const FALLBACK_MODEL_METADATA: readonly OrvixModelMetadata[] = [
  managedModel("orvix/auto"),
  managedModel("orvix/muse-spark-1.2"),
];

// Casing for recurring model-family tokens that plain capitalization gets
// wrong, so unknown future managed IDs render close to vendor naming.
const MANAGED_FAMILY_TOKENS = new Map<string, string>([
  ["ai", "AI"],
  ["gpt", "GPT"],
  ["glm", "GLM"],
  ["vl", "VL"],
  ["mimo", "MiMo"],
  ["deepseek", "DeepSeek"],
  ["minimax", "MiniMax"],
]);

const PREFERRED_ORDER = new Map<string, number>(FALLBACK_MODELS.map((id, index) => [id, index]));

export function isOrvixChatModel(id: string): boolean {
  const value = id.trim().toLowerCase();
  return Boolean(value) && !/(?:^|[-/])(point|embed(?:ding)?s?|image|video|audio|voice|rerank)(?:[-/.]|$)/.test(value);
}

export function orderModels(ids: readonly string[]): string[] {
  return [...new Set(ids.map(canonicalModelId))].filter(isOrvixChatModel).sort((left, right) => {
    const leftRank = PREFERRED_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = PREFERRED_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.localeCompare(right);
  });
}

export function getModelMetadata(id: string): OrvixModelMetadata {
  const canonical = canonicalModelId(id);
  return MANAGED_MODEL_METADATA.get(canonical) ?? model(canonical, DEFAULT_MAX_INPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS);
}

export function resolveMaxOutputTokens(configured: number, advertised: number): number {
  return configured > 0 ? Math.min(configured, advertised) : advertised;
}

export function orderModelMetadata(models: readonly OrvixApiModel[]): OrvixModelMetadata[] {
  const discovered = new Map<string, OrvixModelMetadata>();
  for (const raw of models) {
    const metadata = modelMetadataFromApi(raw);
    if (metadata && !discovered.has(metadata.id)) discovered.set(metadata.id, metadata);
  }
  if (!discovered.size) return [...FALLBACK_MODEL_METADATA];
  return orderModels([...discovered.keys()]).flatMap((id) => {
    const metadata = discovered.get(id);
    return metadata ? [metadata] : [];
  });
}

export function enrichModelMetadata(
  model: OrvixModelMetadata,
  metadata: ModelsDevModelMetadata | undefined,
): OrvixModelMetadata {
  if (!metadata) return model;
  return {
    ...model,
    contextLength: model.contextLength || metadata.contextLength || DEFAULT_MAX_INPUT_TOKENS,
    maxOutputTokens: model.maxOutputTokens || metadata.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
    imageInput: model.imageInput || metadata.imageInput === true,
    toolCalling: metadata.toolCalling ?? model.toolCalling,
    reasoningEffort: metadata.reasoningOptions?.includes("low") === true || model.reasoningEffort,
    description: model.description ?? metadata.description,
    releaseDate: model.releaseDate ?? metadata.releaseDate,
  };
}

export function formatTokenLimit(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`;
  if (tokens >= 1024) return `${Math.round(tokens / 1024)}K`;
  return `${tokens}`;
}

export function formatModelName(id: string): string {
  const canonical = canonicalModelId(id);
  const managedName = MANAGED_MODEL_NAMES.get(canonical);
  if (managedName) return managedName;
  const parts = canonical.replace(/^orvix\//, "").split(/[-\s]+/).filter(Boolean);
  return parts
    .map((part) => {
      const family = MANAGED_FAMILY_TOKENS.get(part);
      if (family) return family;
      if (/^v\d+(?:\.\d+)?$/.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function modelMetadataFromApi(raw: OrvixApiModel): OrvixModelMetadata | undefined {
  if (typeof raw.id !== "string" || !isOrvixChatModel(raw.id)) return undefined;
  const id = canonicalModelId(raw.id);
  const fallback = getModelMetadata(id);
  const architecture = record(raw.architecture);
  const capabilities = record(raw.capabilities);
  const modalities = stringArray(raw.input_modalities) ?? stringArray(architecture?.input_modalities);
  const rawName = typeof raw.name === "string" ? raw.name : "";
  const managedMetadata = MANAGED_MODEL_METADATA.get(id);
  return {
    id,
    name: managedMetadata
      ? fallback.name
      : rawName.trim()
        ? rawName.replace(/^Orvix(?::|\s)\s*/i, "").trim()
        : fallback.name,
    version: typeof raw.version === "string" && raw.version ? raw.version : fallback.version,
    contextLength:
      positiveInteger(raw.context_length ?? raw.max_context_tokens ?? raw.max_model_len) ?? fallback.contextLength,
    maxOutputTokens:
      positiveInteger(raw.max_completion_tokens ?? raw.max_output_tokens ?? capabilities?.max_output_tokens) ??
      fallback.maxOutputTokens,
    imageInput:
      boolean(capabilities?.vision) ??
      boolean(modalities?.some((value) => value.toLowerCase() === "image")) ??
      managedMetadata?.imageInput ??
      /(?:vision|\bvl\b)/i.test(rawName),
    toolCalling:
      boolean(raw.tool_calling ?? raw.tool_call ?? capabilities?.tools) ??
      managedMetadata?.toolCalling ??
      fallback.toolCalling,
    reasoningEffort:
      boolean(capabilities?.reasoning_effort) ?? managedMetadata?.reasoningEffort ?? fallback.reasoningEffort,
    ...(typeof raw.description === "string" && raw.description.trim() ? { description: raw.description.trim() } : {}),
    ...(unixDate(raw.created) ? { releaseDate: unixDate(raw.created) } : {}),
    ...(typeof raw.owned_by === "string" && raw.owned_by.trim() ? { ownedBy: raw.owned_by.trim() } : {}),
    cost: orvixModelCost(id, modelCostFromApi(raw.pricing)),
  };
}

function model(
  id: string,
  contextLength: number,
  maxOutputTokens: number,
  imageInput = false,
  toolCalling = false,
  reasoningEffort = false,
): OrvixModelMetadata {
  return {
    id,
    name: formatModelName(id),
    version: "unknown",
    contextLength,
    maxOutputTokens,
    imageInput,
    toolCalling,
    reasoningEffort,
    cost: orvixModelCost(id),
  };
}

function modelEntry(
  id: string,
  contextLength: number,
  maxOutputTokens: number,
  imageInput = false,
  toolCalling = false,
  reasoningEffort = false,
): readonly [string, OrvixModelMetadata] {
  return [id, model(id, contextLength, maxOutputTokens, imageInput, toolCalling, reasoningEffort)];
}

function managedModel(id: string): OrvixModelMetadata {
  const metadata = MANAGED_MODEL_METADATA.get(id);
  if (!metadata) throw new Error(`Missing managed model metadata for ${id}`);
  return metadata;
}

function canonicalModelId(id: string): string {
  return id.trim().toLowerCase();
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
function unixDate(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? new Date(value * 1_000).toISOString().slice(0, 10)
    : undefined;
}
