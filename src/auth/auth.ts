import { createHash } from "node:crypto";

const GATEWAY_SESSION_PREFIX = "orvixCopilot.entryGatewaySession.v1.";
export function credentialReference(apiKey: string): string {
  return createHash("sha256").update(apiKey.trim()).digest("hex").slice(0, 16);
}
export interface GatewaySession { token: string; refreshToken?: string }
export interface SecretStore {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

/** A browser billing session is explicitly bound by the user to one native entry. */
export class OrvixAuth {
  private readonly mutations = new Map<string, Promise<void>>();
  constructor(private readonly secrets: SecretStore) {}
  async getGatewaySession(entryId: string, credentialRef: string): Promise<GatewaySession | undefined> {
    await this.mutations.get(entryId)?.catch(() => undefined);
    const raw = await this.secrets.get(this.key(entryId));
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as Partial<GatewaySession> & { credentialRef?: string };
      if (parsed.credentialRef !== credentialRef || typeof parsed.token !== "string" || !parsed.token.trim()) return undefined;
      return {
        token: parsed.token.trim(),
        ...(typeof parsed.refreshToken === "string" && parsed.refreshToken.trim() ? { refreshToken: parsed.refreshToken.trim() } : {}),
      };
    } catch { return undefined; }
  }
  async storeGatewaySession(entryId: string, credentialRef: string, session: GatewaySession): Promise<void> {
    if (!session.token.trim()) throw new Error("Orvix session token cannot be empty");
    const key = this.key(entryId);
    await this.mutate(entryId, () => this.secrets.store(key, JSON.stringify({
      credentialRef, token: session.token.trim(),
      ...(session.refreshToken?.trim() ? { refreshToken: session.refreshToken.trim() } : {}),
    })));
  }
  async clearGatewaySession(entryId: string): Promise<void> {
    const key = this.key(entryId);
    await this.mutate(entryId, () => this.secrets.delete(key));
  }
  private async mutate(entryId: string, action: () => PromiseLike<void>): Promise<void> {
    const next = (this.mutations.get(entryId) ?? Promise.resolve()).catch(() => undefined).then(action);
    this.mutations.set(entryId, next);
    try { await next; } finally { if (this.mutations.get(entryId) === next) this.mutations.delete(entryId); }
  }
  private key(entryId: string): string {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(entryId)) throw new Error("Invalid Orvix entryId");
    return `${GATEWAY_SESSION_PREFIX}${entryId}`;
  }
}
