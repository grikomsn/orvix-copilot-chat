import assert from "node:assert/strict";
import test from "node:test";
import { applyReasoningEffort, buildThinkingSchema, resolveEffortValue } from "./options";

function model(id: string, reasoningEffort = true): { id: string; reasoningEffort: boolean } {
  return { id, reasoningEffort };
}

test("exposes the upstream Muse reasoning efforts", () => {
  const schema = buildThinkingSchema(model("orvix/muse-spark-1.2"));
  assert.deepEqual(schema?.properties.reasoningEffort.enum, ["minimal", "low", "medium", "high", "xhigh"]);
  assert.equal(schema?.properties.reasoningEffort.default, "high");
  assert.equal(schema?.properties.reasoningEffort.group, "navigation");
});

test("omits reasoning controls disabled by the managed route", () => {
  assert.equal(buildThinkingSchema(model("orvix/glm-5.3-flash", false)), undefined);
  assert.equal(buildThinkingSchema(model("orvix/deepseek-v4-flash", false)), undefined);
  assert.equal(buildThinkingSchema(model("orvix/minimax-m3", false)), undefined);
  assert.equal(buildThinkingSchema(model("orvix/grok-4.6", false)), undefined);
  assert.equal(buildThinkingSchema(model("orvix/qwen-3.8-flash", false)), undefined);
});

test("uses the documented Luna and DeepSeek effort profiles", () => {
  const schema = buildThinkingSchema(model("orvix/gpt-5.6-luna"));
  assert.deepEqual(schema?.properties.reasoningEffort.enum, ["none", "low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(buildThinkingSchema(model("orvix/deepseek-v4-pro"))?.properties.reasoningEffort.enum, [
    "none",
    "low",
    "high",
    "max",
  ]);
});

test("uses the verified GLM 5.2 and GPT-5.6 Sol/Terra effort profiles", () => {
  const glm = buildThinkingSchema(model("orvix/glm-5.2"));
  assert.deepEqual(glm?.properties.reasoningEffort.enum, [
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  assert.equal(glm?.properties.reasoningEffort.default, "high");
  for (const id of ["orvix/gpt-5.6-sol", "orvix/gpt-5.6-terra"]) {
    assert.deepEqual(buildThinkingSchema(model(id))?.properties.reasoningEffort.enum, [
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  }
});

test("accepts minimal on GPT-5.6 Sol and Terra where Luna rejects it", () => {
  assert.equal(resolveEffortValue(model("orvix/gpt-5.6-sol"), { reasoningEffort: "minimal" }, "high"), "minimal");
  assert.equal(resolveEffortValue(model("orvix/gpt-5.6-terra"), { reasoningEffort: "minimal" }, "high"), "minimal");
  assert.equal(resolveEffortValue(model("orvix/gpt-5.6-luna"), { reasoningEffort: "minimal" }, "high"), "high");
});

test("omits the schema for models without reasoning", () => {
  assert.equal(buildThinkingSchema(model("orvix/auto", false)), undefined);
  assert.equal(buildThinkingSchema(model("orvix/deepseek-v4-flash", false)), undefined);
});

test("per-request effort overrides the workspace default within the profile", () => {
  assert.equal(resolveEffortValue(model("orvix/muse-spark-1.2"), { reasoningEffort: "low" }, "high"), "low");
  assert.equal(resolveEffortValue(model("orvix/muse-spark-1.2"), { thinkingEffort: "medium" }, "max"), "medium");
  assert.equal(resolveEffortValue(model("orvix/muse-spark-1.2"), undefined, "minimal"), "minimal");
});

test("falls back to the profile default for values the model does not accept", () => {
  // GPT-5.6 Luna does not expose minimal.
  assert.equal(resolveEffortValue(model("orvix/gpt-5.6-luna"), { reasoningEffort: "minimal" }, "high"), "high");
  // Unknown/invalid values fall back too.
  assert.equal(resolveEffortValue(model("orvix/muse-spark-1.2"), { reasoningEffort: "max" }, "high"), "high");
  assert.equal(resolveEffortValue(model("orvix/muse-spark-1.2"), undefined, "invalid"), "high");
});

test("returns undefined for models without reasoning", () => {
  assert.equal(resolveEffortValue(model("orvix/auto", false), { reasoningEffort: "low" }, "high"), undefined);
});

test("sends Orvix's OpenAI-compatible reasoning_effort parameter", () => {
  assert.deepEqual(applyReasoningEffort({ model: "orvix/muse-spark-1.2" }, "minimal"), {
    model: "orvix/muse-spark-1.2",
    reasoning_effort: "minimal",
  });
  assert.deepEqual(applyReasoningEffort({ model: "orvix/deepseek-v4-pro" }, "none"), {
    model: "orvix/deepseek-v4-pro",
    reasoning_effort: "none",
  });
});
