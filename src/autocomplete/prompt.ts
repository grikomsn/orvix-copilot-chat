/**
 * Prompt construction for the Orvix chat-completions completion engine.
 *
 * Orvix exposes no FIM endpoint, so fill-in-the-middle is emulated with FIM
 * delimiter tokens inline over the fixed `/chat/completions` endpoint, and
 * reasoning is disabled with the OpenAI-compatible `reasoning_effort: "none"`
 * value the gateway forwards upstream. The live benchmark (2026-09-06)
 * measured only `orvix/deepseek-v4-pro` as clean (zero hidden reasoning,
 * correct output); `orvix/glm-5.2` ignored the switch (510 hidden chars) and
 * is documented as not recommended.
 *
 * Pure and unit-tested.
 */

import type { ChatCompletionPrompt } from "../kit/autocomplete/chat-engine";
import { fimUserContent } from "../kit/autocomplete/postprocess";

export const COMPLETION_SYSTEM_PROMPT = "Return only the missing code at the cursor. No explanations, no markdown.";

export const INLINE_REASONING_EFFORT = "none";

export function buildCompletionPrompt(prefix: string, suffix: string): ChatCompletionPrompt {
  return {
    messages: [
      { role: "system", content: COMPLETION_SYSTEM_PROMPT },
      { role: "user", content: fimUserContent(prefix, suffix) },
    ],
    extra: { reasoning_effort: INLINE_REASONING_EFFORT },
  };
}
