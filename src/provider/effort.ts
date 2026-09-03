import { applyReasoningEffort, type ReasoningEffort } from "../models/options";

/** Adds the OpenAI-compatible reasoning_effort field only when the model supports it. */
export function applyEffortIfSupported(
  body: Readonly<Record<string, unknown>>,
  reasoningEffort: ReasoningEffort | undefined,
  supportsReasoningEffort: boolean,
): Record<string, unknown> {
  return supportsReasoningEffort && reasoningEffort ? applyReasoningEffort(body, reasoningEffort) : body;
}