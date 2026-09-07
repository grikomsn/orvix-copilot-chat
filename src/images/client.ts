/**
 * Orvix image-generation client for `POST /v1/images/generations`.
 *
 * Image generation is a separate prepaid surface: each catalogue model costs a
 * fixed number of Image Credits per image, debited by Orvix before the response
 * is returned. This client builds and validates requests, parses responses
 * defensively, and maps credit/rate-limit failures to typed errors. Network
 * access is injected so the pure logic is testable without a live service.
 */

import { ORVIX_ENDPOINTS } from "../transport/protocol";
import { orvixHeaders } from "../transport/protocol";
import { retryDelayMs } from "../provider/retry";

export type Fetcher = typeof fetch;

/** Image-generation model slugs from the Orvix image catalogue. */
export const IMAGE_MODEL_CREDIT_COSTS: Readonly<Record<string, number>> = {
  "flux-2-pro": 7,
  "qwen-image-3.0": 8,
  "gpt-image-2": 11,
  "grok-imagine-image": 12,
  "midjourney": 22,
  "seedream-5.0-pro": 19,
  "gemini-3-pro-image": 61,
};

/** Default image model used when the caller does not pick one. */
export const DEFAULT_IMAGE_MODEL = "flux-2-pro";

/** Models that always generate exactly one image per request. */
const SINGLE_IMAGE_MODELS = new Set(["seedream-5.0-pro", "midjourney"]);

const MAX_IMAGES = 4;
const MIN_IMAGES = 1;

/** Known error types returned by the image-generation surface. */
export type ImageErrorType =
  | "invalid_request_error"
  | "insufficient_credits"
  | "rate_limit_error"
  | "server_error"
  | "unknown";

/**
 * A failure from the image-generation API. `type` distinguishes the documented
 * error classes so callers can react to missing credits without parsing text.
 */
export class ImageGenerationError extends Error {
  readonly status: number;
  readonly type: ImageErrorType;

  constructor(status: number, type: ImageErrorType, message: string) {
    super(message);
    this.name = "ImageGenerationError";
    this.status = status;
    this.type = type;
  }

  /** Whether the failure means no Image Credits remain (HTTP 402). */
  get isInsufficientCredits(): boolean {
    return this.type === "insufficient_credits" || this.status === 402;
  }
}

/** Validated input for one image-generation request. */
export interface ImageGenerationInput {
  readonly model: string;
  readonly prompt: string;
  readonly n?: number;
  readonly size?: string;
  readonly quality?: string;
  readonly responseFormat?: "url" | "b64_json";
}

/** One generated image from the response `data` array. */
export interface GeneratedImage {
  readonly url?: string;
  readonly b64Json?: string;
}

/** Parsed `POST /v1/images/generations` response. */
export interface ImageGenerationResult {
  readonly created?: number;
  readonly model: string;
  readonly data: readonly GeneratedImage[];
}

/**
 * The credits an image request debits: catalogue cost times image count.
 *
 * Midjourney always bills one grid (n is forced to 1 upstream) and Seedream
 * 5.0 Pro only generates a single image, so both cost one image's credits.
 *
 * @example
 * imageCreditsFor("flux-2-pro", 2); // 14
 * imageCreditsFor("midjourney", 1); // 22
 */
export function imageCreditsFor(model: string, n: number | undefined): number {
  const cost = IMAGE_MODEL_CREDIT_COSTS[canonicalImageModel(model)];
  if (cost === undefined) return 0;
  return cost * resolveImageCount(model, n);
}

/** Canonicalizes a model id, accepting and stripping the `orvix/` prefix. */
export function canonicalImageModel(model: string): string {
  return model.trim().replace(/^orvix\//, "").toLowerCase();
}

/** Resolves the effective image count after per-model constraints. */
export function resolveImageCount(model: string, n: number | undefined): number {
  if (SINGLE_IMAGE_MODELS.has(canonicalImageModel(model))) return 1;
  const requested = Math.floor(n ?? 1);
  return Math.min(MAX_IMAGES, Math.max(MIN_IMAGES, requested));
}

/**
 * Validates and normalizes image-generation input, mirroring the documented
 * request contract: a non-empty prompt, a catalogue model, and n between 1
 * and 4 (forced to 1 for single-image models).
 */
export function validateImageInput(input: ImageGenerationInput): ImageGenerationInput {
  const model = canonicalImageModel(input.model);
  if (!model) throw new ImageGenerationError(0, "invalid_request_error", "An image model is required");
  if (!IMAGE_MODEL_CREDIT_COSTS[model]) {
    throw new ImageGenerationError(0, "invalid_request_error", `Unknown image model: ${model}`);
  }
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new ImageGenerationError(0, "invalid_request_error", "A non-empty prompt is required");
  }
  const n = resolveImageCount(model, input.n);
  return {
    model,
    prompt,
    ...(n === 1 ? {} : { n }),
    ...(input.size?.trim() ? { size: input.size.trim() } : {}),
    ...(input.quality?.trim() ? { quality: input.quality.trim() } : {}),
    ...(input.responseFormat ? { responseFormat: input.responseFormat } : {}),
  };
}

/**
 * Builds the JSON request body for the images endpoint.
 *
 * `response_format` is only sent when requested; Orvix forwards extra fields
 * to the upstream adapter, so absent optional fields are omitted entirely.
 */
export function buildImageRequestBody(input: ImageGenerationInput): Record<string, unknown> {
  const validated = validateImageInput(input);
  return {
    model: validated.model,
    prompt: validated.prompt,
    ...(validated.n !== undefined ? { n: validated.n } : {}),
    ...(validated.size !== undefined ? { size: validated.size } : {}),
    ...(validated.quality !== undefined ? { quality: validated.quality } : {}),
    ...(validated.responseFormat !== undefined ? { response_format: validated.responseFormat } : {}),
  };
}

/**
 * Parses an image-generation response body defensively.
 *
 * Returns `undefined` when the payload carries no recognizable images, so
 * callers can distinguish a malformed response from an empty one. Both `url`
 * and `b64_json` entries are accepted per the documented behavior.
 */
export function parseImageResponse(raw: unknown, expectedModel?: string): ImageGenerationResult | undefined {
  if (!isRecord(raw)) return undefined;
  const model = textValue(raw.model) ?? expectedModel ?? "";
  const entries = Array.isArray(raw.data) ? raw.data.filter(isRecord) : [];
  const data = entries
    .map((entry): GeneratedImage | undefined => {
      const url = textValue(entry.url);
      const b64 = textValue(entry.b64_json);
      if (!url && !b64) return undefined;
      return { ...(url ? { url } : {}), ...(b64 ? { b64Json: b64 } : {}) };
    })
    .filter((image): image is GeneratedImage => image !== undefined);
  if (!model && !data.length) return undefined;
  return { model, ...(numberValue(raw.created) !== undefined ? { created: numberValue(raw.created) } : {}), data };
}

/**
 * Parses the documented `{"error":{"message","type"}}` error body into a
 * typed {@link ImageGenerationError}. Unknown payloads degrade to the status
 * code alone; messages are bounded so upstream text is never echoed at length.
 */
export async function imageErrorOf(response: Response): Promise<ImageGenerationError> {
  const text = (await response.text().catch(() => "")).trim();
  let message = "";
  let type: ImageErrorType | undefined;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown; type?: unknown } };
    const rawMessage = parsed.error?.message;
    const rawType = parsed.error?.type;
    if (typeof rawMessage === "string") message = rawMessage;
    if (typeof rawType === "string" && isKnownImageErrorType(rawType)) type = rawType;
  } catch {
    /* Keep the bounded fallback message. */
  }
  if (!type) type = fallbackErrorType(response.status);
  if (!message) message = fallbackErrorMessage(response.status, type);
  return new ImageGenerationError(response.status, type, message.slice(0, 300));
}

/**
 * Issues one image-generation request against the fixed Orvix endpoint.
 *
 * Transient server errors (429/502) are retried twice with the shared backoff
 * policy before surfacing; credit and validation failures fail immediately.
 */
export class ImageGenerationClient {
  private readonly fetcher: Fetcher;

  constructor(
    private readonly options: {
      readonly apiKey: string;
      readonly userAgent: string;
      readonly timeoutMs?: number;
      readonly fetcher?: Fetcher;
    },
  ) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async generate(input: ImageGenerationInput, signal?: AbortSignal): Promise<ImageGenerationResult> {
    const body = buildImageRequestBody(input);
    const timeout = this.options.timeoutMs ? AbortSignal.timeout(this.options.timeoutMs) : undefined;
    const signals = [...(signal ? [signal] : []), ...(timeout ? [timeout] : [])];
    const requestSignal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    let lastError: ImageGenerationError | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(ORVIX_ENDPOINTS.images, {
          method: "POST",
          headers: orvixHeaders(this.options.apiKey, "application/json", this.options.userAgent),
          body: JSON.stringify(body),
          signal: requestSignal,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new ImageGenerationError(0, "unknown", `Orvix image request failed: ${errorText(error)}`);
      }
      if (response.ok) {
        const parsed = parseImageResponse(await response.json().catch(() => undefined), body.model as string);
        if (!parsed) throw new ImageGenerationError(response.status, "unknown", "Orvix returned an unreadable image response");
        return parsed;
      }
      const error = await imageErrorOf(response);
      if (error.status === 429 || error.status === 502 || error.status === 503 || error.status === 504) {
        lastError = error;
        await response.body?.cancel().catch(() => undefined);
        if (attempt < 2) {
          // Space retries out so a busy gateway is not hammered; the shared
          // policy honors Retry-After and doubles the delay per attempt.
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt, response.headers.get("retry-after"))));
          continue;
        }
      }
      throw error;
    }
    throw lastError ?? new ImageGenerationError(0, "unknown", "Orvix image request failed");
  }
}

function isKnownImageErrorType(value: string): value is ImageErrorType {
  return (
    value === "invalid_request_error"
    || value === "insufficient_credits"
    || value === "rate_limit_error"
    || value === "server_error"
  );
}

function fallbackErrorType(status: number): ImageErrorType {
  if (status === 400) return "invalid_request_error";
  if (status === 402) return "insufficient_credits";
  if (status === 429) return "rate_limit_error";
  if (status === 502) return "server_error";
  return "unknown";
}

function fallbackErrorMessage(status: number, type: ImageErrorType): string {
  if (type === "insufficient_credits") {
    return "No Image Credits remain. Image generation uses prepaid Image Credits; buy more on the Orvix Plans page.";
  }
  if (type === "rate_limit_error") {
    return "Orvix image rate limit reached for this model. Wait a few seconds and retry, or switch to a different image model (for example qwen-image-3.0 publishes a low soft RPM).";
  }
  if (type === "server_error") {
    return "All Orvix image routes failed (HTTP 502). This is an Orvix-side outage, not a request problem: wait a moment and retry, or try a different image model.";
  }
  return `Orvix image request failed (HTTP ${status})`;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
