import assert from "node:assert/strict";
import test from "node:test";
import { applyReasoningEffort, buildThinkingSchema, resolveEffortValue } from "./options";

function model(id: string, reasoningEffort = true): { id: string; reasoningEffort: boolean } {
  return { id, reasoningEffort };
}

test("exposes full reasoning efforts for broadly capable models", () => {
  const schema = buildThinkingSchema(model("orvix/muse-spark-1.2"));
  assert.deepEqual(schema?.properties.reasoningEffort.enum, ["minimal", "low", "medium", "high", "max"]);
  assert.equal(schema?.properties.reasoningEffort.default, "high");
  assert.equal(schema?.properties.reasoningEffort.group, "navigation");
});

test("narrows GLM-5.3 Flash to only low and high", () => {
  const schema = buildThinkingSchema(model("orvix/glm-5.3-flash"));
  assert.deepEqual(schema?.properties.reasoningEffort.enum, ["low", "high"]);
  assert.equal(schema?.properties.reasoningEffort.default, "high");
  assert.equal(buildThinkingSchema(model("orvix/glm-5.3-flash", false)), undefined);
});

test("excludes minimal for GPT-5.6 Luna", () => {
  const schema = buildThinkingSchema(model("orvix/gpt-5.6-luna"));
  assert.deepEqual(schema?.properties.reasoningEffort.enum, ["low", "medium", "high", "max"]);
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
  // GLM-5.3 Flash rejects minimal/medium/max; fall back to high.
  assert.equal(resolveEffortValue(model("orvix/glm-5.3-flash"), { reasoningEffort: "minimal" }, "high"), "high");
  assert.equal(resolveEffortValue(model("orvix/glm-5.3-flash"), { reasoningEffort: "max" }, "high"), "high");
  // GPT-5.6 Luna rejects minimal.
  assert.equal(resolveEffortValue(model("orvix/gpt-5.6-luna"), { reasoningEffort: "minimal" }, "high"), "high");
  // Unknown/invalid values fall back too.
  assert.equal(resolveEffortValue(model("orvix/muse-spark-1.2"), { reasoningEffort: "none" }, "high"), "high");
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
  assert.deepEqual(applyReasoningEffort({ model: "orvix/glm-5.3-flash" }, "high"), {
    model: "orvix/glm-5.3-flash",
    reasoning_effort: "high",
  });
});
