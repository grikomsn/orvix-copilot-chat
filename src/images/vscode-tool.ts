/**
 * Extension-registered VS Code language-model tool for Orvix image generation.
 *
 * The tool is not an Orvix chat hosted tool: the model selects it through the
 * ordinary function-tool protocol, and VS Code invokes
 * {@link OrvixImageGenerationTool.invoke}, which calls the fixed
 * `POST /v1/images/generations` endpoint with the stored API key. Generated
 * images are returned as tool-result text (URLs plus the credits spent); image
 * bytes are never inlined into the model context. All testable logic lives in
 * the VS Code-free `./tool-logic` module.
 */

import * as vscode from "vscode";
import { ImageGenerationClient, ImageGenerationError } from "./client";
import {
  coerceImageInput,
  fetchInlineImage,
  formatImageResult,
  imageInvocationMessage,
  imageToolCredits,
  inlineImageMime,
  inlineImageSources,
  type ImageToolInput,
  type InlineImageSource,
} from "./tool-logic";

/** VS Code tool name; the `toolReferenceName` in package.json is `orvixImages`. */
export const ORVIX_IMAGE_TOOL_NAME = "orvix-copilot-chat_generateImage";

export interface ImageToolDependencies {
  /** Resolves the API key for inference requests; rejects when unconfigured. */
  readonly resolveApiKey: () => Promise<string | undefined>;
  /** Resolves the user's configured default image model, if any. */
  readonly resolveDefaultModel: () => string | undefined;
  readonly userAgent: string;
  readonly output?: vscode.OutputChannel;
  /** Overrides the default network layer (used by smoke tests). */
  readonly fetcher?: typeof fetch;
}

export class OrvixImageGenerationTool implements vscode.LanguageModelTool<ImageToolInput> {
  constructor(private readonly dependencies: ImageToolDependencies) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationOptions<ImageToolInput>,
  ): vscode.PreparedToolInvocation {
    return { invocationMessage: imageInvocationMessage(options.input, this.dependencies.resolveDefaultModel()) };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ImageToolInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const coerced = coerceImageInput(options.input, this.dependencies.resolveDefaultModel());
    if (typeof coerced === "string") {
      throw new ImageGenerationError(0, "invalid_request_error", coerced);
    }
    const apiKey = await this.dependencies.resolveApiKey();
    if (!apiKey) {
      throw new Error("An Orvix API key is required for image generation. Run ‘Orvix: Configure API Key’.");
    }

    const client = new ImageGenerationClient({
      apiKey,
      userAgent: this.dependencies.userAgent,
      // Image generation can take a while on grid models, but an unbounded
      // tool call hangs the chat turn; 120s covers slow upstreams.
      timeoutMs: 120_000,
      ...(this.dependencies.fetcher ? { fetcher: this.dependencies.fetcher } : {}),
    });
    const controller = new AbortController();
    const cancellation = token.onCancellationRequested(() => controller.abort());
    try {
      const result = await client.generate(coerced, controller.signal);
      const creditsSpent = imageToolCredits(coerced.model, coerced.n);
      this.dependencies.output?.appendLine(
        `[images] model=${result.model || coerced.model} images=${result.data.length} credits=${creditsSpent}`,
      );
      // Unconditionally inline every generated image into the tool result:
      // VS Code renders image data parts in the thread, and vision-capable
      // chat models receive the bytes on later turns. Non-vision models
      // degrade the parts to placeholders at the conversion layer, and the
      // URLs stay in the text part either way. Inlining is best-effort —
      // a fetch failure only loses the preview, never the result.
      const inline = await Promise.all(
        inlineImageSources(result.data).map(async (source) => {
          if (!source) return undefined;
          if (source.source === "b64") return { bytes: source.bytes, mimeType: source.mimeType };
          const fetched = await fetchInlineImage(source.url, this.dependencies.fetcher ?? fetch);
          return fetched
            ? { bytes: fetched.bytes, mimeType: inlineImageMime(fetched.contentType) }
            : undefined;
        }),
      );
      const images: InlineImageSource[] = inline.filter(
        (image): image is InlineImageSource => image !== undefined,
      );
      const parts: (vscode.LanguageModelTextPart | vscode.LanguageModelDataPart)[] = [
        new vscode.LanguageModelTextPart(formatImageResult(result, creditsSpent)),
        ...images.map(
          (image) => new vscode.LanguageModelDataPart(image.bytes, image.mimeType),
        ),
      ];
      if (images.length < result.data.length) {
        this.dependencies.output?.appendLine(
          `[images] inlined ${images.length}/${result.data.length} (fetch/size failures skipped)`,
        );
      }
      return new vscode.LanguageModelToolResult(parts);
    } finally {
      cancellation.dispose();
    }
  }
}
