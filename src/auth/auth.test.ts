import assert from "node:assert/strict";
import test from "node:test";
import { API_KEY_SECRET, credentialReference, OrvixAuth, type SecretStore } from "./auth";

class MemorySecrets implements SecretStore {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

test("stores trimmed API keys and clears them", async () => {
  const secrets = new MemorySecrets();
  const auth = new OrvixAuth(secrets);

  assert.equal(await auth.hasApiKey(), false);
  await auth.storeApiKey("  orv-sk_live_secret  ");
  assert.equal(secrets.values.get(API_KEY_SECRET), "orv-sk_live_secret");
  assert.equal(await auth.getApiKey(), "orv-sk_live_secret");
  assert.equal(await auth.hasApiKey(), true);

  await auth.clearApiKey();
  assert.equal(await auth.getApiKey(), undefined);
});

test("rejects empty API keys", async () => {
  const auth = new OrvixAuth(new MemorySecrets());
  await assert.rejects(() => auth.storeApiKey(" \n "), /cannot be empty/);
});

test("rejects keys without the documented live-key prefix", async () => {
  const auth = new OrvixAuth(new MemorySecrets());
  await assert.rejects(() => auth.storeApiKey("not-an-orvix-key"), /must start with orv-sk_live_/);
});

test("creates a stable non-reversible credential reference", () => {
  assert.equal(credentialReference(" Orvix-secret "), credentialReference("Orvix-secret"));
  assert.match(credentialReference("Orvix-secret"), /^[a-f0-9]{16}$/);
  assert.notEqual(credentialReference("Orvix-secret"), credentialReference("another-secret"));
});
