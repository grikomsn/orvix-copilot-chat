import assert from "node:assert/strict";
import test from "node:test";
import { fetchImageCatalogue, parseImageCatalogue } from "./catalogue";
import { ORVIX_GATEWAY_ENDPOINTS } from "../transport/protocol";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CATALOGUE_ENTRY = {
  model: "orvix/flux-2-pro",
  displayName: "Flux 2 Pro",
  enabled: true,
  available: true,
  minTier: "pro",
  capabilities: {
    vision: true,
    imageGeneration: true,
    imageCreditCost: 7,
    imageSoftRpm: null,
    maxOutputTokens: 0,
  },
  tokensPerPlanUnit: { ember: 1 },
  discountPercent: 0,
  discountEndsAt: null,
  health: { status: "healthy" },
};

const CHAT_ENTRY = {
  model: "muse-spark-1.2",
  displayName: "Muse Spark 1.2",
  enabled: true,
  available: true,
  capabilities: { vision: true, imageGeneration: false, imageCreditCost: 0 },
};

test("parses image-capable catalogue entries and drops chat models", () => {
  const models = parseImageCatalogue({ success: true, data: [CATALOGUE_ENTRY, CHAT_ENTRY] });
  assert.deepEqual(models, [
    {
      model: "flux-2-pro",
      displayName: "Flux 2 Pro",
      imageCreditCost: 7,
      enabled: true,
      available: true,
    },
  ]);
});

test("ignores malformed catalogue payloads", () => {
  assert.deepEqual(parseImageCatalogue(undefined), []);
  assert.deepEqual(parseImageCatalogue("nope"), []);
  assert.deepEqual(parseImageCatalogue({ data: "nope" }), []);
  assert.deepEqual(parseImageCatalogue({ data: [{ model: "x" }] }), []);
  assert.deepEqual(
    parseImageCatalogue({ data: [{ model: "midjourney", capabilities: { imageGeneration: true, imageCreditCost: 22 } }] }),
    [{ model: "midjourney", imageCreditCost: 22, enabled: true, available: true }],
  );
});

test("fetches the gateway image catalogue with the session token", async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), headers: (init as RequestInit).headers as Record<string, string> });
    return jsonResponse(200, { success: true, data: [CATALOGUE_ENTRY] });
  };
  const models = await fetchImageCatalogue("session-token", "agent/1", { fetcher });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ORVIX_GATEWAY_ENDPOINTS.imageCatalogue);
  assert.equal(calls[0].headers.Authorization, "Bearer session-token");
  assert.equal(calls[0].headers["User-Agent"], "agent/1");
  assert.equal(models?.length, 1);
});

test("degrades gracefully on auth failure and malformed bodies", async () => {
  const unauthorized: typeof fetch = async () => jsonResponse(401, { error: "nope" });
  assert.equal(await fetchImageCatalogue("t", "u", { fetcher: unauthorized }), undefined);
  const broken: typeof fetch = async () => jsonResponse(200, { success: true, data: [] });
  assert.equal(await fetchImageCatalogue("t", "u", { fetcher: broken }), undefined);
  const failing: typeof fetch = async () => {
    throw new Error("network down");
  };
  assert.equal(await fetchImageCatalogue("t", "u", { fetcher: failing }), undefined);
});
