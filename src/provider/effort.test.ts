import assert from "node:assert/strict";
import test from "node:test";
import { applyEffortIfSupported } from "./effort";

test("adds reasoning_effort only for supported models with an effort", () => {
  const body = { model: "orvix/muse-spark-1.2", stream: true, max_tokens: 128 };
  assert.deepEqual(applyEffortIfSupported(body, "high", true), {
    model: "orvix/muse-spark-1.2",
    stream: true,
    max_tokens: 128,
    reasoning_effort: "high",
  });
});

test("does not add reasoning_effort for models without reasoning", () => {
  const body = { model: "orvix/auto", stream: true, max_tokens: 128 };
  assert.deepEqual(applyEffortIfSupported(body, "high", false), body);
});

test("does not add reasoning_effort when no effort is resolved", () => {
  const body = { model: "orvix/muse-spark-1.2", stream: true, max_tokens: 128 };
  assert.deepEqual(applyEffortIfSupported(body, undefined, true), body);
});

test("does not mutate the input body", () => {
  const body: Record<string, unknown> = { model: "orvix/muse-spark-1.2" };
  const result = applyEffortIfSupported(body, "low", true);
  assert.deepEqual(body, { model: "orvix/muse-spark-1.2" });
  assert.deepEqual(result, { model: "orvix/muse-spark-1.2", reasoning_effort: "low" });
});