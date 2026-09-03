import assert from "node:assert/strict";
import test from "node:test";
import { API_BASE, ORVIX_ENDPOINTS, extensionUserAgent, orvixHeaders } from "./protocol";

test("keeps Orvix endpoints and request identity centralized", () => {
  assert.equal(ORVIX_ENDPOINTS.models, `${API_BASE}/models`);
  assert.equal(ORVIX_ENDPOINTS.chat, `${API_BASE}/chat/completions`);
  assert.equal(extensionUserAgent("1.2.3", "1.125.0"), "orvix-copilot-chat/1.2.3 VSCode/1.125.0");
  assert.deepEqual(orvixHeaders("secret", "application/json", "agent"), {
    Authorization: "Bearer secret",
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "agent",
  });
});
