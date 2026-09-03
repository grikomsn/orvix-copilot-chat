import { createHash } from "node:crypto";

export const API_KEY_SECRET = "orvixCopilot.apiKey";

export function credentialReference(apiKey: string): string {
  return createHash("sha256").update(apiKey.trim()).digest("hex").slice(0, 16);
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
}
