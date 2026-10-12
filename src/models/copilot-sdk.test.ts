import assert from "node:assert/strict";
import test from "node:test";
import { applyEffortIfSupported } from "../provider/effort";
import { buildModelConfigurationSchema, contextSizeOptions, resolveEffortValue } from "./options";

// VS Code 1.141 reads reasoningEffort, then filters through its agent-host tiers.
const SDK_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);

test("Copilot SDK BYOK discovers Orvix's model-specific effort lists alongside Context Window", () => {
  const cases = [
    ["orvix/muse-spark-1.2", ["minimal", "low", "medium", "high", "xhigh"]],
    ["orvix/deepseek-v4-pro", ["none", "low", "high", "max"]],
  ] as const;
  for (const [id, expected] of cases) {
    for (const context of [undefined, contextSizeOptions(450_000)]) {
      const schema = buildModelConfigurationSchema({ id, reasoningEffort: true }, context);
      const effortSchema = schema?.properties.reasoningEffort;
      assert.ok(effortSchema, `${id}: BYOK requires reasoningEffort`);
      const bridged = (effortSchema.enum as unknown[]).filter((value): value is string => typeof value === "string");
      assert.deepEqual(bridged.filter((effort) => SDK_EFFORTS.has(effort)), expected, id);
      assert.equal(effortSchema.default, "high");
    }
  }
  assert.equal(buildModelConfigurationSchema({ id: "orvix/auto", reasoningEffort: false }, contextSizeOptions(450_000))?.properties.reasoningEffort, undefined);
});

test("Copilot SDK effort selections reach Orvix requests only on supported routes", () => {
  const model = { id: "orvix/muse-spark-1.2", reasoningEffort: true };
  const schema = buildModelConfigurationSchema(model, contextSizeOptions(450_000));
  const bridged = (schema?.properties.reasoningEffort.enum as unknown[]).filter((value): value is string => typeof value === "string");
  for (const selected of bridged.filter((effort) => SDK_EFFORTS.has(effort))) {
    const effort = resolveEffortValue(model, { reasoningEffort: selected }, "high");
    assert.equal(effort, selected);
    assert.deepEqual(applyEffortIfSupported({ model: model.id }, effort, true), { model: model.id, reasoning_effort: selected });
    assert.deepEqual(applyEffortIfSupported({ model: "orvix/auto" }, effort, false), { model: "orvix/auto" });
  }
});
