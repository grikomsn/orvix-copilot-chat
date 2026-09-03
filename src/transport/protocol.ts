export const API_BASE = "https://api.orvix.id/v1";

export const ORVIX_ENDPOINTS = {
  models: `${API_BASE}/models`,
  chat: `${API_BASE}/chat/completions`,
} as const;

export function extensionUserAgent(version: string, vscodeVersion: string): string {
  return `orvix-copilot-chat/${version} VSCode/${vscodeVersion}`;
}

export function orvixHeaders(apiKey: string, accept: string, userAgent: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: accept,
    "User-Agent": userAgent,
  };
}
