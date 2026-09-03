import assert from "node:assert/strict";
import test from "node:test";
import { costCategory, orvixModelCost, modelCostFromApi, modelPricingFields } from "./pricing";

test("converts Orvix per-token API rates to per-million costs", () => {
  assert.deepEqual(modelCostFromApi({
    prompt: "0.00000018",
    cache_prompt: "0.00000004",
    completion: "0.00000035",
  }), { input: 0.18, cacheRead: 0.04, output: 0.35 });
  assert.equal(modelCostFromApi({ prompt: "invalid", completion: "0.000001" }), undefined);
});

test("converts USD per-million rates to VS Code pricing fields", () => {
  assert.deepEqual(modelPricingFields({ input: 0.18, cacheRead: 0.04, output: 0.35 }), {
    pricing: "In: $0.18 · Out: $0.35 /1M tokens",
    inputCost: 18,
    outputCost: 35,
    cacheCost: 4,
    priceCategory: "low",
  });
  assert.equal(modelPricingFields(undefined), undefined);
});

test("does not guess Orvix rates when live metadata omits pricing", () => {
  assert.equal(orvixModelCost("orvix/muse-spark-1.2"), undefined);
  assert.deepEqual(orvixModelCost("orvix/example", { input: 1, output: 2 }), { input: 1, output: 2 });
  assert.equal(orvixModelCost("future-model"), undefined);
});

test("categorizes a weighted three-to-one input and output blend", () => {
  assert.equal(costCategory({ input: 0.2, output: 1.2 }), "low");
  assert.equal(costCategory({ input: 2, output: 12 }), "medium");
  assert.equal(costCategory({ input: 5, output: 25 }), "high");
  assert.equal(costCategory({ input: 30, output: 180 }), "very_high");
});
