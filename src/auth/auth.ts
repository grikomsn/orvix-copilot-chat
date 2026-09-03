import { createHash } from "node:crypto";

export const API_KEY_SECRET = "orvixCopilot.apiKey";
export const GATEWAY_SESSION_SECRET = "orvixCopilot.gatewaySession";

export function credentialReference(apiKey: string): string {
  return createHash("sha256").update(apiKey.trim()).digest("hex").slice(0, 16);
}

/**
 * A browser gateway session used to read billing and usage. The access token
 * is short-lived (~1h) and backed by a rotating refresh token.
 */
export interface GatewaySession {
  token: string;
  refreshToken?: string;
}

export interface SecretStore {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export class OrvixAuth {
  constructor(private readonly secrets: SecretStore) {}

  async hasApiKey(): Promise<boolean> {
    return Boolean(await this.getApiKey());
  }

  async getApiKey(): Promise<string | undefined> {
    const value = await this.secrets.get(API_KEY_SECRET);
    return value?.trim() || undefined;
  }

  async storeApiKey(value: string): Promise<void> {
    const apiKey = value.trim();
    if (!apiKey) throw new Error("Orvix API key cannot be empty");
    if (!apiKey.startsWith("orv-sk_live_")) throw new Error("Orvix API keys must start with orv-sk_live_");
    await this.secrets.store(API_KEY_SECRET, apiKey);
  }

  async clearApiKey(): Promise<void> {
    await this.secrets.delete(API_KEY_SECRET);
  }

  /** Returns the stored gateway session, if any. */
  async getGatewaySession(): Promise<GatewaySession | undefined> {
    const raw = await this.secrets.get(GATEWAY_SESSION_SECRET);
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as Partial<GatewaySession>;
      const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
      if (!token) return undefined;
      return {
        token,
        ...(typeof parsed.refreshToken === "string" && parsed.refreshToken.trim()
          ? { refreshToken: parsed.refreshToken.trim() }
          : {}),
      };
    } catch {
      return undefined;
    }
  }

  /** Persists a gateway session for billing/usage access. */
  async storeGatewaySession(session: GatewaySession): Promise<void> {
    const token = session.token.trim();
    if (!token) throw new Error("Orvix session token cannot be empty");
    await this.secrets.store(
      GATEWAY_SESSION_SECRET,
      JSON.stringify({
        token,
        ...(session.refreshToken?.trim() ? { refreshToken: session.refreshToken.trim() } : {}),
      }),
    );
  }

  async clearGatewaySession(): Promise<void> {
    await this.secrets.delete(GATEWAY_SESSION_SECRET);
  }
}
