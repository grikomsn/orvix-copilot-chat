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

/** Builds the credits metadata payload reported alongside the tool result. */
export function imageCreditsPayload(
  result: ImageGenerationResult,
  creditsSpent: number,
  fallbackModel: string,
): Record<string, unknown> {
  return { model: result.model || fallbackModel, creditsSpent, images: result.data.length };
}

/** Re-exported for the tool shell and tests. */
export { imageCreditsFor };
