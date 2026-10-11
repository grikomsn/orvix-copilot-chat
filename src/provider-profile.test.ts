import assert from "node:assert/strict";
import test from "node:test";
import { apiKeyFromConfiguration, Credentials } from "./provider-profile";
import { credentialReference } from "./auth/auth";

test("requires a well-formed live Orvix API key from entry configuration", () => {
  assert.equal(apiKeyFromConfiguration({ apiKey: "  orv-sk_live_synthetic  " }), "orv-sk_live_synthetic");
  assert.equal(apiKeyFromConfiguration({ apiKey: "invalid" }), undefined);
  assert.equal(apiKeyFromConfiguration({}), undefined);
});

test("credentials register once per distinct key and share fingerprints", () => {
  const credentials = new Credentials();
  const first = credentials.register("orv-sk_live_a");
  const second = credentials.register("orv-sk_live_b");
  const shared = credentials.register(" orv-sk_live_shared ");
  const sameShared = credentials.register("orv-sk_live_shared");
  assert.notEqual(first, second);
  assert.equal(shared, sameShared);
  assert.equal(credentials.keyForCredential(shared), "orv-sk_live_shared");
  assert.match(shared, /^[a-f0-9]{16}$/);
  assert.match(credentialReference("key"), /^[a-f0-9]{16}$/);
});

test("has and keyForCredential resolve only provisioned keys", () => {
  const credentials = new Credentials();
  const ref = credentials.register("orv-sk_live_a");
  assert.equal(credentials.has(ref), true);
  assert.equal(credentials.has("deadbeef"), false);
  assert.equal(credentials.keyForCredential("deadbeef"), undefined);
});

test("activeApiKey prefers the most recently provisioned key", async () => {
  const credentials = new Credentials();
  assert.equal(credentials.activeApiKey(), undefined);
  credentials.register("orv-sk_live_a");
  await new Promise((resolve) => setTimeout(resolve, 5));
  credentials.register("orv-sk_live_b");
  assert.equal(credentials.activeApiKey(), "orv-sk_live_b");
});
