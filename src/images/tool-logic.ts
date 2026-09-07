/**
 * Pure image-tool logic, free of VS Code imports.
 *
 * The `vscode` module is not resolvable under the plain `node --test` runner,
 * so everything testable about the image-generation tool (result formatting,
 * credit accounting, input coercion) lives here; the thin VS Code tool shell
 * in `./tool` only bridges to `vscode.LanguageModelTool`.
 */

import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODEL_CREDIT_COSTS,
  imageCreditsFor,
  resolveImageCount,
  type Fetcher,
  type ImageGenerationResult,
} from "./client";
import type { ImageCatalogueModel } from "./catalogue";

/** Resolves a model id to its canonical catalogue slug. */
function canonicalImageModel(model: string): string {
  return model.trim().replace(/^orvix\//, "").toLowerCase();
}

/** Input schema mirrored from the package.json tool contribution. */
export interface ImageToolInput {
  readonly model?: unknown;
  readonly prompt?: unknown;
  readonly n?: unknown;
  readonly size?: unknown;
  readonly quality?: unknown;
  readonly response_format?: unknown;
}

/**
 * Formats one image-generation result into tool-result text.
 *
 * The model sees the image URLs, the generation metadata, and the credits the
 * request debited — everything needed to answer the user without the bytes.
 *
 * @example
 * formatImageResult(result, 7);
 * // => "Generated 1 image with flux-2-pro (7 Image Credits spent).\nhttps://…"
 */
export function formatImageResult(result: ImageGenerationResult, creditsSpent: number): string {
  const lines: string[] = [];
  const count = result.data.length;
  const model = result.model || "image model";
  lines.push(
    `Generated ${count} ${count === 1 ? "image" : "images"} with ${model}`
    + ` (${creditsSpent} Image ${creditsSpent === 1 ? "Credit" : "Credits"} spent).`,
  );
  result.data.forEach((image, index) => {
    const position = count > 1 ? `${index + 1}. ` : "";
    if (image.url) lines.push(`${position}${image.url}`);
    else if (image.b64Json) lines.push(`${position}[base64 image data returned inline]`);
  });
  if (!result.data.length) lines.push("Orvix returned no images for this request.");
  return lines.join("\n");
}

/**
 * Resolves the credits a request debits, preferring live catalogue costs over
 * the bundled table.
 *
 * @example
 * imageToolCredits("orvix/flux-2-pro", 2); // 14
 */
export function imageToolCredits(
  model: string,
  n: number | undefined,
  catalogue?: readonly ImageCatalogueModel[],
): number {
  const canonical = model.trim().replace(/^orvix\//, "").toLowerCase();
  const override = catalogue?.find((entry) => entry.model === canonical);
  const cost = override?.imageCreditCost ?? IMAGE_MODEL_CREDIT_COSTS[canonical];
  if (cost === undefined) return 0;
  return cost * resolveImageCount(model, n);
}

/**
 * Coerces the raw tool input into validated image-generation input.
 *
 * When the caller omits `model`, `defaultModel` is used (the user's configured
 * default, falling back to the cheapest bundled model). Returns an error
 * string when the input cannot be used; the tool shell turns that into a typed
 * failure without touching the network.
 */
export function coerceImageInput(
  input: ImageToolInput,
  defaultModel?: string,
): { model: string; prompt: string; n?: number; size?: string; quality?: string; responseFormat?: "url" | "b64_json" } | string {
  const rawModel = typeof input.model === "string" ? input.model.trim() : "";
  const configuredDefault = defaultModel?.trim();
  const fallback = configuredDefault && IMAGE_MODEL_CREDIT_COSTS[canonicalImageModel(configuredDefault)]
    ? configuredDefault
    : DEFAULT_IMAGE_MODEL;
  // An explicit-but-unknown model falls back to the default instead of failing,
  // so a calling model's bad guess never blocks generation.
  const model = rawModel && IMAGE_MODEL_CREDIT_COSTS[canonicalImageModel(rawModel)] ? rawModel : fallback;
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt) return "A non-empty prompt is required";
  const cost = imageToolCredits(model, undefined);
  if (!model || cost === 0) {
    return `Unknown image model: ${model}. Orvix image models are: `
      + Object.keys(IMAGE_MODEL_CREDIT_COSTS).join(", ");
  }
  return {
    model,
    prompt,
    ...(typeof input.n === "number" ? { n: input.n } : {}),
    ...(typeof input.size === "string" ? { size: input.size } : {}),
    ...(typeof input.quality === "string" ? { quality: input.quality } : {}),
    ...(input.response_format === "url" || input.response_format === "b64_json"
      ? { responseFormat: input.response_format }
      : {}),
  };
}

/** Builds the invocation message shown before the request runs. */
export function imageInvocationMessage(input: ImageToolInput, defaultModel?: string): string {
  const resolved = coerceImageInput(input, defaultModel);
  if (typeof resolved === "string") {
    return "Generating an image with Orvix…";
  }
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  const credits = imageToolCredits(resolved.model, typeof input.n === "number" ? input.n : undefined);
  const costHint = credits > 0 ? ` (costs ${credits} Image ${credits === 1 ? "Credit" : "Credits"})` : "";
  const usedDefault = typeof input.model !== "string" || !input.model.trim();
  const viaDefault = usedDefault ? " [default model]" : "";
  const prefix = prompt
    ? `Generating “${prompt.slice(0, 60)}” with ${resolved.model}${viaDefault}`
    : `Generating an image with ${resolved.model}${viaDefault}`;
  return `${prefix}${costHint}…`;
}

/** Skip inlining when the fetched image bytes exceed this budget (10 MB). */
export const INLINE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Timeout for one hosted-image byte fetch (per image). */
export const INLINE_IMAGE_FETCH_TIMEOUT_MS = 30_000;

/** A generated image decoded to inline-ready bytes. */
export interface InlineImageSource {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

/**
 * Resolves the inline sources for a generation result, unconditionally: URL
 * entries become fetch descriptors and `b64_json` entries decode directly, so
 * the tool shell can render every image in the chat thread. Sizing is a pure
 * check here — `b64Json` length approximates decoded size (base64 inflates by
 * 4/3, so a 10 MB cap admits at most ~7.5 MB of decoded bytes), and actual
 * byte-level enforcement happens after fetching.
 *
 * Returns `{ bytes, mimeType }` per image; entries that cannot be inlined
 * (oversized `b64`, unparseable data URLs) are `undefined` and simply skip
 * inlining without failing the tool result.
 *
 * @example
 * inlineImageSources([{ url: "https://…" }]);
 * // => [{ source: "url", url: "https://…" }]
 */
export function inlineImageSources(
  images: readonly { url?: string; b64Json?: string }[],
  maxBytes = INLINE_IMAGE_MAX_BYTES,
): readonly ({ source: "url"; url: string } | { source: "b64"; bytes: Uint8Array; mimeType: string } | undefined)[] {
  return images.map((image) => {
    if (image.url) {
      if (!/^https?:\/\//i.test(image.url)) return undefined;
      return { source: "url", url: image.url };
    }
    if (image.b64Json) {
      // ~4/3 overhead: reject before decoding if the base64 alone busts the cap.
      if (image.b64Json.length * 0.75 > maxBytes) return undefined;
      const comma = image.b64Json.indexOf(",");
      const dataUrl = /^data:[^;,]+(;base64)?,/i.test(image.b64Json);
      const encoded = dataUrl ? image.b64Json.slice(comma + 1) : image.b64Json;
      const mime = dataUrl ? /^data:([^;,]+)/i.exec(image.b64Json)?.[1] : undefined;
      try {
        const bytes = Buffer.from(encoded, "base64");
        if (!bytes.length) return undefined;
        return { source: "b64", bytes: new Uint8Array(bytes), mimeType: mime ?? "image/jpeg" };
      } catch {
        return undefined;
      }
    }
    return undefined;
  });
}

/**
 * Fetches the bytes behind one hosted image URL with a hard timeout and size
 * cap, capturing the response content type for the inline data part. Any
 * failure resolves `undefined` — inlining is best-effort and must never break
 * the tool result.
 */
export async function fetchInlineImage(
  url: string,
  fetcher: Fetcher,
  maxBytes = INLINE_IMAGE_MAX_BYTES,
  timeoutMs = INLINE_IMAGE_FETCH_TIMEOUT_MS,
): Promise<{ bytes: Uint8Array; contentType: string | null } | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) return undefined;
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > maxBytes) return undefined;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) return undefined;
    return {
      bytes: new Uint8Array(buffer),
      contentType: response.headers.get("content-type"),
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Maps response content types to the MIME types VS Code accepts for images. */
export function inlineImageMime(contentType: string | null): string {
  if (!contentType) return "image/jpeg";
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return mime.startsWith("image/") ? mime : "image/jpeg";
}

/** Re-exported for the tool shell and tests. */
export { imageCreditsFor };
