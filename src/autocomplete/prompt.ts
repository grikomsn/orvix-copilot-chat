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

export interface CompletionPrompt {
  readonly messages: ReadonlyArray<{ role: string; content: string }>;
  /** Extra body fields (the reasoning-off switch). */
  readonly extra: Readonly<Record<string, unknown>>;
}

export const COMPLETION_SYSTEM_PROMPT = "Return only the missing code at the cursor. No explanations, no markdown.";

export const INLINE_REASONING_EFFORT = "none";

const FIM = { prefix: "<|fim_prefix|>", suffix: "<|fim_suffix|>", middle: "<|fim_middle|>" } as const;

export function buildCompletionPrompt(prefix: string, suffix: string): CompletionPrompt {
  return {
    messages: [
      { role: "system", content: COMPLETION_SYSTEM_PROMPT },
      { role: "user", content: `${FIM.prefix}${prefix}${FIM.suffix}${suffix}${FIM.middle}` },
    ],
    extra: { reasoning_effort: INLINE_REASONING_EFFORT },
  };
}