import assert from "node:assert/strict";
import test from "node:test";
import { apiKeyFromConfiguration, credentialRefForApiKey, qualifiedModelId } from "./provider-profile";

test("normalizes native provider-entry API keys without exposing them", () => {
  assert.equal(apiKeyFromConfiguration({ apiKey: "  orv-sk_live_secret  " }), "orv-sk_live_secret");
  assert.equal(apiKeyFromConfiguration({ apiKey: "other-secret" }), undefined);
  assert.equal(apiKeyFromConfiguration({ apiKey: "" }), undefined);
  assert.equal(apiKeyFromConfiguration({}), undefined);
});

test("keeps legacy and native provider-entry model IDs distinct", () => {
  assert.equal(credentialRefForApiKey("legacy-key", "legacy-key"), "legacy");
  const reference = credentialRefForApiKey("entry-key", "legacy-key");
  assert.match(reference, /^key-[a-f0-9]{16}$/);
  assert.equal(qualifiedModelId("legacy", "glm-5.2"), "glm-5.2");
  assert.equal(qualifiedModelId(reference, "glm-5.2"), `${reference}::glm-5.2`);
});
