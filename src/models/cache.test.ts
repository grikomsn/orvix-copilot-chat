import assert from "node:assert/strict";
import test from "node:test";
import { parseCatalogSnapshots } from "./cache";

test("restores only complete persisted Orvix catalogs", () => {
  const model = {
    id: "m",
    name: "M",
    version: "1",
    contextLength: 10,
    maxOutputTokens: 5,
    imageInput: false,
    toolCalling: true,
    reasoningEffort: false,
  };
  assert.deepEqual(parseCatalogSnapshots({ legacy: [model], broken: [{ id: "bad" }] }), { legacy: [model] });
  assert.deepEqual(parseCatalogSnapshots(null), {});
});
