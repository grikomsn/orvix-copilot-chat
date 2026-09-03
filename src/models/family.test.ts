import assert from "node:assert/strict";
import test from "node:test";
import { modelFamily } from "./family";

test("groups managed models by their native family", () => {
  assert.equal(modelFamily("orvix/muse-spark-1.2"), "muse");
  assert.equal(modelFamily("orvix/deepseek-v4-pro"), "deepseek");
  assert.equal(modelFamily("orvix/auto"), "auto");
});
