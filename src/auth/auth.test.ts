import assert from "node:assert/strict";
import test from "node:test";
import { credentialReference, OrvixAuth, type SecretStore } from "./auth";

class MemorySecrets implements SecretStore {
  readonly values = new Map<string, string>();
  async get(key: string): Promise<string | undefined> { return this.values.get(key); }
  async store(key: string, value: string): Promise<void> { this.values.set(key, value); }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

test("billing sessions require an explicit entry and credential binding", async () => {
  const secrets = new MemorySecrets();
  const auth = new OrvixAuth(secrets);
  secrets.values.set("orvixCopilot.gatewaySession", JSON.stringify({ token: "unbound" }));
  assert.equal(await auth.getGatewaySession("work", "work:aaa"), undefined);
  await auth.storeGatewaySession("work", "work:aaa", { token: " synthetic-session ", refreshToken: " synthetic-refresh " });
  assert.deepEqual(await auth.getGatewaySession("work", "work:aaa"), { token: "synthetic-session", refreshToken: "synthetic-refresh" });
  assert.equal(await auth.getGatewaySession("personal", "work:aaa"), undefined);
  assert.equal(await auth.getGatewaySession("work", "work:bbb"), undefined);
  await auth.clearGatewaySession("work");
  assert.equal(await auth.getGatewaySession("work", "work:aaa"), undefined);
  assert.equal(secrets.values.has("orvixCopilot.gatewaySession"), true);
});

test("rejects empty billing sessions and invalid aliases without logging credentials", async () => {
  const auth = new OrvixAuth(new MemorySecrets());
  await assert.rejects(() => auth.storeGatewaySession("work", "aaa", { token: " " }), /cannot be empty/);
  await assert.rejects(() => auth.storeGatewaySession("bad::alias", "aaa", { token: "synthetic" }), /Invalid Orvix/);
});

test("credential fingerprints are stable and non-reversible", () => {
  assert.equal(credentialReference(" synthetic "), credentialReference("synthetic"));
  assert.match(credentialReference("synthetic"), /^[a-f0-9]{16}$/);
  assert.notEqual(credentialReference("synthetic"), credentialReference("other"));
});

test("a queued removal retires a billing session while its write is pending", async () => {
  const secrets = new MemorySecrets();
  let release: (() => void) | undefined;
  const originalStore = secrets.store.bind(secrets);
  secrets.store = async (key, value): Promise<void> => {
    await new Promise<void>((resolve) => { release = resolve; });
    await originalStore(key, value);
  };
  const auth = new OrvixAuth(secrets);
  const writing = auth.storeGatewaySession("work", "work:a", { token: "synthetic" });
  const removing = auth.clearGatewaySession("work");
  while (!release) await new Promise<void>((resolve) => setImmediate(resolve));
  release();
  await Promise.all([writing, removing]);
  assert.equal(await auth.getGatewaySession("work", "work:a"), undefined);
});
