import assert from "node:assert/strict";
import test from "node:test";
import { apiKeyFromConfiguration, entryIdFromConfiguration, NativeEntries, qualifiedModelId } from "./provider-profile";

test("requires an explicit canonical entry ID rather than a display-name slug", () => {
  for (const entryId of [undefined, "A B", "A-B", "first::second", "x".repeat(65)]) {
    assert.throws(() => entryIdFromConfiguration({ entryId, name: "display label" }), /unique entryId/);
  }
  assert.equal(entryIdFromConfiguration({ entryId: "work-team" }), "work-team");
  assert.equal(apiKeyFromConfiguration({ apiKey: "  orv-sk_live_synthetic  " }), "orv-sk_live_synthetic");
  assert.equal(apiKeyFromConfiguration({ apiKey: "invalid" }), undefined);
});

test("rotation preserves selections and retires old handles, including rotating back", () => {
  const entries = new NativeEntries();
  const a = entries.register({ entryId: "work", apiKey: "orv-sk_live_a" });
  assert.equal(entries.register({ entryId: "work", apiKey: "orv-sk_live_a" }).generation, a.generation);
  const b = entries.register({ entryId: "work", apiKey: "orv-sk_live_b" });
  assert.throws(() => entries.key(a), /changed or was forgotten/);
  assert.equal(qualifiedModelId(a.entryId, "orvix/auto"), qualifiedModelId(b.entryId, "orvix/auto"));
  const a2 = entries.register({ entryId: "work", apiKey: "orv-sk_live_a" });
  assert.notEqual(a.generation, a2.generation);
  assert.equal(entries.matches(a), false);
  assert.equal(entries.key(a2), "orv-sk_live_a");
});

test("entries with the same key and label keep separate scope and explicit forget retires handles", () => {
  const entries = new NativeEntries();
  const a = entries.register({ entryId: "one", name: "Same", apiKey: "orv-sk_live_shared" });
  const b = entries.register({ entryId: "two", name: "Same", apiKey: "orv-sk_live_shared" });
  assert.notEqual(a.credentialRef, b.credentialRef);
  entries.forget("one");
  assert.throws(() => entries.key(a), /changed or was forgotten/);
  assert.equal(entries.key(b), "orv-sk_live_shared");
  assert.throws(() => entries.get("one"), /Select an available/);
});
