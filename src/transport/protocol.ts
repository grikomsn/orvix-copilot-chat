export const API_BASE = "https://api.orvix.id/v1";

/** Host of the Orvix gateway used for billing and usage endpoints. */
export const GATEWAY_BASE = "https://gateway.orvix.id";

/** Fixed API endpoints for model discovery and chat completions. */
export const ORVIX_ENDPOINTS = {
  models: `${API_BASE}/models`,
  chat: `${API_BASE}/chat/completions`,
} as const;

/** Fixed gateway endpoints for credits, usage, and account balance data. */
export const ORVIX_GATEWAY_ENDPOINTS = {
  billing: `${GATEWAY_BASE}/billing`,
  transactions: `${GATEWAY_BASE}/billing/transactions`,
  usageSummary: `${GATEWAY_BASE}/usage/summary`,
  balance: `${GATEWAY_BASE}/balance`,
  topUps: `${GATEWAY_BASE}/balance/topups`,
} as const;

/**
 * Builds the extension user agent string.
 *
 * @example
 * extensionUserAgent("0.2.1", "1.125.0"); // "orvix-copilot-chat/0.2.1 VSCode/1.125.0"
 */
export function extensionUserAgent(version: string, vscodeVersion: string): string {
  return `orvix-copilot-chat/${version} VSCode/${vscodeVersion}`;
}

/**
 * Builds headers for the Chat Completions API.
 *
 * @see {@link ORVIX_ENDPOINTS}
 */
export function orvixHeaders(apiKey: string, accept: string, userAgent: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: accept,
    "User-Agent": userAgent,
  };
}
