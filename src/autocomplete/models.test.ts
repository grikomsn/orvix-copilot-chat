import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_INLINE_MODEL } from "./config";
import { inlineCompatibleModelIds } from "../models/options";
import { inlineModelCandidates, inlineModelChoices } from "./models";

test("derives compatible ids from the verified thinking profiles", () => {
  const ids = inlineCompatibleModelIds();
  assert.equal(ids.includes("orvix/deepseek-v4-pro"), true);
  assert.equal(ids.includes("orvix/gpt-5.6-luna"), true);
  assert.equal(ids.includes("orvix/muse-spark-1.2"), false, "muse profiles lack the none value");
});

test("leads with the measured recommended default", () => {
  const candidates = inlineModelCandidates();
  assert.equal(candidates[0]?.id, DEFAULT_INLINE_MODEL);
  assert.equal(candidates[0]?.badge.includes("★ recommended"), true);
});

test("unmeasured compatible models follow the default; warnings come last", () => {
  const candidates = inlineModelCandidates();
  const ids = candidates.map((candidate) => candidate.id);
  assert.equal(ids[1], "orvix/gpt-5.6-luna");
  assert.ok(ids.includes("orvix/gpt-5.6-sol"));
  assert.ok(ids.includes("orvix/gpt-5.6-terra"));
  const glmIndex = ids.indexOf("orvix/glm-5.2");
  assert.ok(glmIndex > 0);
  assert.equal(candidates[glmIndex]?.badge.startsWith("⚠"), true);
  assert.equal(ids.at(-1), "orvix/glm-5.2", "the warning model should sort last");
});

test("every candidate carries a badge and a rationale, ids unique", () => {
  const candidates = inlineModelCandidates();
  for (const candidate of candidates) {
    assert.ok(candidate.badge.length > 0);
    assert.ok(candidate.detail.length > 0);
  }
  assert.equal(new Set(candidates.map((candidate) => candidate.id)).size, candidates.length);
});

test("pins an unlisted current value above the vetted list", () => {
  const choices = inlineModelChoices("orvix/custom-model");
  assert.equal(choices[0]?.id, "orvix/custom-model");
  assert.equal(choices[0]?.description, "current value");
  assert.equal(choices[1]?.id, DEFAULT_INLINE_MODEL);
});

test("marks the current value with a check without pinning duplicates", () => {
  const choices = inlineModelChoices(DEFAULT_INLINE_MODEL);
  assert.equal(choices[0]?.label, `$(check) ${DEFAULT_INLINE_MODEL}`);
  assert.equal(choices.filter((choice) => choice.id === DEFAULT_INLINE_MODEL).length, 1);
});
