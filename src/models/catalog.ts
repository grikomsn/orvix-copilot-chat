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
  readonly pricing?: unknown;
  readonly tool_calling?: unknown;
  readonly tool_call?: unknown;
  readonly description?: unknown;
  readonly created?: unknown;
  readonly owned_by?: unknown;
}

export const FALLBACK_MODEL_METADATA: readonly OrvixModelMetadata[] = [
  model("orvix/auto", 128_000, DEFAULT_MAX_OUTPUT_TOKENS, false, true),
  model("orvix/muse-spark-1.2", 1_000_000, 32_000, true, true, true),
];

const MANAGED_CAPABILITIES = new Map<string, Pick<OrvixModelMetadata, "imageInput" | "toolCalling" | "reasoningEffort">>([
  ["orvix/auto", { imageInput: false, toolCalling: true, reasoningEffort: false }],
  ["orvix/muse-spark-1.2", { imageInput: true, toolCalling: true, reasoningEffort: true }],
  ["orvix/muse-spark-1.3", { imageInput: true, toolCalling: true, reasoningEffort: true }],
  ["orvix/glm-5.3-flash", { imageInput: false, toolCalling: false, reasoningEffort: true }],
  ["orvix/gpt-5.6-luna", { imageInput: true, toolCalling: true, reasoningEffort: true }],
  ["orvix/deepseek-v4-flash", { imageInput: false, toolCalling: true, reasoningEffort: true }],
  ["orvix/gemini-3.7-flash", { imageInput: true, toolCalling: true, reasoningEffort: false }],
  ["orvix/minimax-m3", { imageInput: false, toolCalling: true, reasoningEffort: true }],
  ["orvix/qwen-3.8-max", { imageInput: true, toolCalling: true, reasoningEffort: true }],
  ["orvix/deepseek-v4-pro", { imageInput: false, toolCalling: true, reasoningEffort: true }],
  ["orvix/kimi-k3", { imageInput: false, toolCalling: true, reasoningEffort: true }],
]);

const PREFERRED_ORDER = new Map<string, number>(FALLBACK_MODELS.map((id, index) => [id, index]));
const FALLBACK_METADATA_BY_ID = new Map(FALLBACK_MODEL_METADATA.map((metadata) => [metadata.id, metadata]));

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
  return (
    FALLBACK_METADATA_BY_ID.get(canonical) ?? model(canonical, DEFAULT_MAX_INPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS)
  );
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
  return id
    .replaceAll("/", " ")
    .split(/[-\s]+/)
    .map((part) => {
      if (/^(ai|glm|kimi|mimo|qwen|vl|v\d+(?:\.\d+)?)$/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function modelMetadataFromApi(raw: OrvixApiModel): OrvixModelMetadata | undefined {
  if (typeof raw.id !== "string" || !isOrvixChatModel(raw.id)) return undefined;
  const id = canonicalModelId(raw.id);
  const fallback = getModelMetadata(id);
  const architecture = record(raw.architecture);
  const modalities = stringArray(raw.input_modalities) ?? stringArray(architecture?.input_modalities);
  const rawName = typeof raw.name === "string" ? raw.name : "";
  const managedCapabilities = MANAGED_CAPABILITIES.get(id);
  return {
    id,
    name: rawName.trim() ? rawName.replace(/^Orvix:\s*/i, "").trim() : fallback.name,
    version: typeof raw.version === "string" && raw.version ? raw.version : fallback.version,
    contextLength:
      positiveInteger(raw.context_length ?? raw.max_context_tokens ?? raw.max_model_len) ?? fallback.contextLength,
    maxOutputTokens: positiveInteger(raw.max_completion_tokens ?? raw.max_output_tokens) ?? fallback.maxOutputTokens,
    imageInput:
      boolean(modalities?.some((value) => value.toLowerCase() === "image")) ??
      managedCapabilities?.imageInput ??
      /(?:vision|\bvl\b)/i.test(rawName),
    toolCalling: boolean(raw.tool_calling ?? raw.tool_call) ?? managedCapabilities?.toolCalling ?? fallback.toolCalling,
    reasoningEffort: managedCapabilities?.reasoningEffort ?? false,
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
