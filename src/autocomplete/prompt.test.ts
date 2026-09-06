import assert from "node:assert/strict";
import test from "node:test";
import { buildCompletionPrompt, COMPLETION_SYSTEM_PROMPT, INLINE_REASONING_EFFORT, stripSpecialTokens } from "./prompt";

test("emulates fill-in-the-middle with FIM tokens", () => {
  const prompt = buildCompletionPrompt("before", "after");
  assert.equal(prompt.messages[0]?.content, COMPLETION_SYSTEM_PROMPT);
  assert.equal(
    prompt.messages[1]?.content,
    "<|fim_prefix|>before<|fim_suffix|>after<|fim_middle|>",
  );
});

test("always sends the measured reasoning-off switch", () => {
  assert.equal(INLINE_REASONING_EFFORT, "none");
  assert.deepEqual(buildCompletionPrompt("a", "b").extra, { reasoning_effort: "none" });
});

test("strips echoed special tokens from suggestions", () => {
  assert.equal(stripSpecialTokens("<|file_separator|>    out.append(x)"), "    out.append(x)");
  assert.equal(stripSpecialTokens("    out.append(x)<|fim_middle|>"), "    out.append(x)");
  assert.equal(stripSpecialTokens("<|fim_prefix|>a<|fim_suffix|>b<|fim_middle|>c"), "abc");
  assert.equal(stripSpecialTokens("    out.append(x)"), "    out.append(x)");
  assert.equal(stripSpecialTokens("echo <| b; # no closing pair"), "echo <| b; # no closing pair");
  assert.equal(stripSpecialTokens("<|file_separator|>"), "");
});