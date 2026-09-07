/**
 * Gateway image-model catalogue access.
 *
 * The Orvix gateway exposes `GET /models/catalogue` with per-model image
 * capabilities, including `imageGeneration`, `imageCreditCost`, and
 * `imageSoftRpm`. The catalogue is the authoritative source for image credit
 * prices; it requires the browser gateway session the extension already uses
 * for billing. When the session is unavailable, callers fall back to the
 * bundled catalogue costs in {@link ./client}.
 */

import { ORVIX_GATEWAY_ENDPOINTS } from "../transport/protocol";

export type Fetcher = typeof fetch;

/** One image-capable entry from the gateway model catalogue. */
export interface ImageCatalogueModel {
  readonly model: string;
  readonly displayName?: string;
  readonly imageCreditCost: number;
  readonly imageSoftRpm?: number;
  readonly enabled: boolean;
  readonly available: boolean;
}

/**
 * Parses a `GET /models/catalogue` response into image-capable models.
 *
 * Only entries advertising `imageGeneration === true` with a positive credit
 * cost are returned; chat models and malformed entries are dropped. Unknown
 * gateway fields are ignored so catalogue additions never break parsing.
 *
 * @example
 * parseImageCatalogue({
 *   success: true,
 *   data: [{ model: "flux-2-pro", capabilities: { imageGeneration: true, imageCreditCost: 7 }, enabled: true, available: true }],
 * });
 * // => [{ model: "flux-2-pro", imageCreditCost: 7, enabled: true, available: true }]
 */
export function parseImageCatalogue(raw: unknown): ImageCatalogueModel[] {
  const root = isRecord(raw) ? raw : undefined;
  if (!root) return [];
  // Unwrap the gateway `{ success, data }` envelope. `data` may be an entry
  // array or a `{ models: [...] }` object; a missing envelope falls back to
  // the root itself.
  const dataValue = root.data !== undefined ? root.data : root;
  const data = isRecord(dataValue) ? dataValue : undefined;
  const entries: unknown[] = Array.isArray(dataValue)
    ? dataValue
    : data && Array.isArray(data.models)
      ? data.models
      : [];
  return entries
    .filter(isRecord)
    .map((entry): ImageCatalogueModel | undefined => {
      const model = textValue(entry.model);
      const capabilities = isRecord(entry.capabilities) ? entry.capabilities : undefined;
      const imageGeneration = capabilities?.imageGeneration === true;
      const cost = positiveNumber(capabilities?.imageCreditCost);
      if (!model || !imageGeneration || cost === undefined) return undefined;
      return {
        model: model.replace(/^orvix\//, "").toLowerCase(),
        ...(textValue(entry.displayName) ? { displayName: textValue(entry.displayName) } : {}),
        imageCreditCost: cost,
        ...(positiveNumber(capabilities?.imageSoftRpm) !== undefined
          ? { imageSoftRpm: positiveNumber(capabilities?.imageSoftRpm) }
          : {}),
        enabled: entry.enabled !== false,
        available: entry.available !== false,
      };
    })
    .filter((model): model is ImageCatalogueModel => model !== undefined);
}

/**
 * Fetches the gateway image catalogue with a browser session.
 *
 * Returns `undefined` on authentication failure (missing or expired session)
 * so callers can fall back to bundled costs without treating the situation as
 * a hard error.
 */
export async function fetchImageCatalogue(
  sessionToken: string,
  userAgent: string,
  options: { fetcher?: Fetcher; signal?: AbortSignal } = {},
): Promise<ImageCatalogueModel[] | undefined> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(ORVIX_GATEWAY_ENDPOINTS.imageCatalogue, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        Accept: "application/json",
        "User-Agent": userAgent,
      },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    return undefined;
  }
  if (response.status === 401) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  const body = await response.json().catch(() => undefined);
  const models = parseImageCatalogue(body);
  return models.length ? models : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
