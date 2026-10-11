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

/** A browser billing session is explicitly bound by the user to one credential. */
export class OrvixAuth {
  private readonly mutations = new Map<string, Promise<void>>();
  constructor(private readonly secrets: SecretStore) {}
  async getGatewaySession(credentialRef: string): Promise<GatewaySession | undefined> {
    await this.mutations.get(credentialRef)?.catch(() => undefined);
    const raw = await this.secrets.get(this.key(credentialRef));
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
  async storeGatewaySession(credentialRef: string, session: GatewaySession): Promise<void> {
    if (!session.token.trim()) throw new Error("Orvix session token cannot be empty");
    const key = this.key(credentialRef);
    await this.mutate(credentialRef, () => this.secrets.store(key, JSON.stringify({
      credentialRef, token: session.token.trim(),
      ...(session.refreshToken?.trim() ? { refreshToken: session.refreshToken.trim() } : {}),
    })));
  }
  async clearGatewaySession(credentialRef: string): Promise<void> {
    const key = this.key(credentialRef);
    await this.mutate(credentialRef, () => this.secrets.delete(key));
  }
  private async mutate(credentialRef: string, action: () => PromiseLike<void>): Promise<void> {
    const next = (this.mutations.get(credentialRef) ?? Promise.resolve()).catch(() => undefined).then(action);
    this.mutations.set(credentialRef, next);
    try { await next; } finally { if (this.mutations.get(credentialRef) === next) this.mutations.delete(credentialRef); }
  }
  private key(credentialRef: string): string {
    if (!/^[a-f0-9]{16}$/.test(credentialRef)) throw new Error("Invalid Orvix credential reference");
    return `${GATEWAY_SESSION_PREFIX}${credentialRef}`;
  }
}
