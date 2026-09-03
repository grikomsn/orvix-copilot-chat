export const MODELS_DEV_API_URL = "https://models.dev/api.json";
export const MODELS_DEV_CACHE_KEY = "orvixCopilot.modelsDevMetadata.v1";
export const MODELS_DEV_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface ModelsDevModelMetadata {
  readonly id: string;
  readonly description?: string;
  readonly contextLength?: number;
  readonly maxOutputTokens?: number;
  readonly imageInput?: boolean;
  readonly toolCalling?: boolean;
  readonly reasoning?: boolean;
  readonly reasoningOptions?: readonly string[];
  readonly releaseDate?: string;
}
export interface ModelsDevSnapshot {
  readonly fetchedAt: number;
  readonly models: Readonly<Record<string, ModelsDevModelMetadata>>;
}
export interface MetadataCache {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export function normalizeModelsDevSnapshot(payload: unknown, fetchedAt: number): ModelsDevSnapshot {
  const providers = record(payload);
  if (!providers) throw new Error("Models.dev returned no provider catalog");
  const normalized: Record<string, ModelsDevModelMetadata> = {};
  for (const [providerId, providerValue] of Object.entries(providers)) {
    const models = record(record(providerValue)?.models);
    if (!models) continue;
    for (const [key, value] of Object.entries(models)) {
      const model = normalizeModel(key, value);
      if (!model) continue;
      normalized[`${providerId}/${model.id}`] = model;
      normalized[model.id] ??= model;
    }
  }
  if (!Object.keys(normalized).length) throw new Error("Models.dev returned no usable models");
  return { fetchedAt, models: normalized };
}

export function resolveModelsDevMetadata(
  snapshot: ModelsDevSnapshot,
  modelId: string,
  ownedBy?: string,
): ModelsDevModelMetadata | undefined {
  const nativeId = modelId.replace(/^orvix\//i, "");
  const owner = ownedBy?.trim().toLowerCase();
  return (owner && owner !== "orvix" ? snapshot.models[`${owner}/${nativeId}`] : undefined) ?? snapshot.models[nativeId];
}

export function parseCachedModelsDevSnapshot(value: unknown): ModelsDevSnapshot | undefined {
  const raw = record(value);
  const models = record(raw?.models);
  if (!raw || !number(raw.fetchedAt) || !models) return undefined;
  try {
    return normalizeCachedModels(models, raw.fetchedAt as number);
  } catch {
    return undefined;
  }
}

export class ModelsDevMetadata {
  private snapshot?: ModelsDevSnapshot;
  private loaded = false;
  private refreshPromise?: Promise<ModelsDevSnapshot>;
  constructor(
    private readonly cache: MetadataCache,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getOrRefresh(): Promise<ModelsDevSnapshot> {
    this.load();
    if (!this.snapshot) return this.refresh();
    if (this.now() - this.snapshot.fetchedAt >= MODELS_DEV_CACHE_TTL_MS) void this.refresh();
    return this.snapshot;
  }

  async refresh(): Promise<ModelsDevSnapshot> {
    this.load();
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.fetchAndCache().finally(() => {
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }

  private async fetchAndCache(): Promise<ModelsDevSnapshot> {
    try {
      const response = await this.fetchImpl(MODELS_DEV_API_URL, {
        headers: { accept: "application/json" },
        signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(15_000) : undefined,
      });
      if (!response.ok) throw new Error(`Models.dev metadata request failed: ${response.status}`);
      const next = normalizeModelsDevSnapshot(await response.json(), this.now());
      this.snapshot = next;
      try {
        await this.cache.update(MODELS_DEV_CACHE_KEY, next);
      } catch {
        /* Cache writes are best effort. */
      }
      return next;
    } catch {
      return this.snapshot ?? { fetchedAt: 0, models: {} };
    }
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.snapshot = parseCachedModelsDevSnapshot(this.cache.get<unknown>(MODELS_DEV_CACHE_KEY));
  }
}

function normalizeModel(key: string, value: unknown): ModelsDevModelMetadata | undefined {
  const raw = record(value);
  if (!raw) return undefined;
  const id = text(raw.id) ?? key.trim();
  if (!id) return undefined;
  const limit = record(raw.limit);
  const modalities = record(raw.modalities);
  const input = strings(modalities?.input);
  const options = reasoningOptions(raw.reasoning_options);
  return {
    id,
    ...(text(raw.description) ? { description: text(raw.description) } : {}),
    ...(positive(limit?.context) ? { contextLength: positive(limit?.context) } : {}),
    ...(positive(limit?.output) ? { maxOutputTokens: positive(limit?.output) } : {}),
    ...(input.length ? { imageInput: input.includes("image") } : {}),
    ...(typeof raw.tool_call === "boolean" ? { toolCalling: raw.tool_call } : {}),
    ...(typeof raw.reasoning === "boolean" ? { reasoning: raw.reasoning } : {}),
    ...(options ? { reasoningOptions: options } : {}),
    ...(text(raw.release_date) ? { releaseDate: text(raw.release_date) } : {}),
  };
}

function normalizeCachedModels(models: Record<string, unknown>, fetchedAt: number): ModelsDevSnapshot {
  const parsed: Record<string, ModelsDevModelMetadata> = {};
  for (const [key, value] of Object.entries(models)) {
    const model = normalizeModel(key, cachedToRaw(value));
    if (!model) throw new Error("invalid cache");
    parsed[key] = model;
  }
  return { fetchedAt, models: parsed };
}
function cachedToRaw(value: unknown): unknown {
  const raw = record(value);
  return raw
    ? {
        id: raw.id,
        description: raw.description,
        limit: { context: raw.contextLength, output: raw.maxOutputTokens },
        modalities: {
          input: raw.imageInput === true ? ["text", "image"] : raw.imageInput === false ? ["text"] : [],
        },
        tool_call: raw.toolCalling,
        reasoning: raw.reasoning,
        reasoning_options: Array.isArray(raw.reasoningOptions)
          ? [{ type: "effort", values: raw.reasoningOptions }]
          : undefined,
        release_date: raw.releaseDate,
      }
    : value;
}
function reasoningOptions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = [
    ...new Set(
      value.flatMap((entry) => {
        const item = record(entry);
        return item?.type === "effort" ? strings(item.values) : [];
      }),
    ),
  ];
  return result.length ? result : undefined;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}
function number(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
