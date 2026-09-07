import assert from "node:assert/strict";
import test from "node:test";
import {
  ImageGenerationClient,
  ImageGenerationError,
  IMAGE_MODEL_CREDIT_COSTS,
  buildImageRequestBody,
  canonicalImageModel,
  imageCreditsFor,
  imageErrorOf,
  parseImageResponse,
  resolveImageCount,
  validateImageInput,
} from "./client";
import { ORVIX_ENDPOINTS } from "../transport/protocol";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("validates image input against the documented request contract", () => {
  const input = validateImageInput({ model: "orvix/flux-2-pro", prompt: "  A red bicycle  ", n: 2 });
  assert.deepEqual(input, { model: "flux-2-pro", prompt: "A red bicycle", n: 2 });
  assert.throws(() => validateImageInput({ model: "flux-2-pro", prompt: "   " }), /non-empty prompt/);
  assert.throws(() => validateImageInput({ model: "", prompt: "x" }), /image model is required/);
  assert.throws(() => validateImageInput({ model: "muse-spark-1.2", prompt: "x" }), /Unknown image model/);
});

test("forces a single image for models that only generate one", () => {
  assert.equal(resolveImageCount("seedream-5.0-pro", 3), 1);
  assert.equal(resolveImageCount("midjourney", undefined), 1);
  assert.equal(resolveImageCount("flux-2-pro", undefined), 1);
  assert.equal(resolveImageCount("flux-2-pro", 4), 4);
  assert.equal(resolveImageCount("flux-2-pro", 9), 4);
  assert.equal(resolveImageCount("flux-2-pro", 0), 1);
});

test("builds request bodies that omit absent optional fields", () => {
  assert.deepEqual(buildImageRequestBody({ model: "gpt-image-2", prompt: "cat" }), {
    model: "gpt-image-2",
    prompt: "cat",
  });
  assert.deepEqual(
    buildImageRequestBody({ model: "gpt-image-2", prompt: "cat", n: 2, size: "1024x1024", responseFormat: "url" }),
    { model: "gpt-image-2", prompt: "cat", n: 2, size: "1024x1024", response_format: "url" },
  );
});

test("costs requests with the catalogue credit prices", () => {
  assert.deepEqual(IMAGE_MODEL_CREDIT_COSTS["gemini-3-pro-image"], 61);
  assert.equal(imageCreditsFor("flux-2-pro", 2), 14);
  assert.equal(imageCreditsFor("midjourney", 4), 22);
  assert.equal(imageCreditsFor("seedream-5.0-pro", 4), 19);
  assert.equal(imageCreditsFor("unknown-model", 2), 0);
  assert.equal(canonicalImageModel("orvix/GPT-Image-2"), "gpt-image-2");
});

test("parses generated image responses defensively", () => {
  const parsed = parseImageResponse({
    created: 1_757_200_000,
    model: "orvix/flux-2-pro",
    data: [{ url: "https://example.invalid/a.png" }, { b64_json: "abcd" }, { other: true }],
  });
  assert.deepEqual(parsed, {
    created: 1_757_200_000,
    model: "orvix/flux-2-pro",
    data: [{ url: "https://example.invalid/a.png" }, { b64Json: "abcd" }],
  });
  assert.equal(parseImageResponse({ data: [] }, "flux-2-pro")?.model, "flux-2-pro");
  assert.equal(parseImageResponse(undefined), undefined);
  assert.equal(parseImageResponse("nope"), undefined);
  assert.equal(parseImageResponse({ data: [{ unsupported: true }] }), undefined);
});

test("maps the documented error surface to typed failures", async () => {
  const error = await imageErrorOf(jsonResponse(402, {
    error: { message: "No remaining Image Credits", type: "insufficient_credits" },
  }));
  assert.equal(error.status, 402);
  assert.equal(error.type, "insufficient_credits");
  assert.equal(error.isInsufficientCredits, true);

  const rate = await imageErrorOf(jsonResponse(429, { error: { type: "rate_limit_error" } }));
  assert.equal(rate.type, "rate_limit_error");
  assert.match(rate.message, /rate limit/);

  const fallback = await imageErrorOf(jsonResponse(400, "not json"));
  assert.equal(fallback.type, "invalid_request_error");
  assert.equal((await imageErrorOf(jsonResponse(500, {}))).type, "unknown");
});

test("posts a bounded image request and parses the response", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return jsonResponse(200, {
      created: 123,
      model: "flux-2-pro",
      data: [{ url: "https://example.invalid/image.png" }],
    });
  };
  const client = new ImageGenerationClient({
    apiKey: "orv-sk_live_test",
    userAgent: "orvix-copilot-chat/test",
    fetcher,
  });
  const result = await client.generate({ model: "orvix/flux-2-pro", prompt: "A red bicycle", n: 2 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ORVIX_ENDPOINTS.images);
  assert.equal((calls[0].init as { method?: string }).method, "POST");
  const headers = (calls[0].init as { headers: Record<string, string> }).headers;
  assert.equal(headers.Authorization, "Bearer orv-sk_live_test");
  assert.equal(headers["User-Agent"], "orvix-copilot-chat/test");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { model: "flux-2-pro", prompt: "A red bicycle", n: 2 });
  assert.deepEqual(result.data, [{ url: "https://example.invalid/image.png" }]);
});

test("surfaces insufficient credits without retrying", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return jsonResponse(402, { error: { message: "No remaining Image Credits", type: "insufficient_credits" } });
  };
  const client = new ImageGenerationClient({ apiKey: "k", userAgent: "u", fetcher });
  await assert.rejects(
    client.generate({ model: "flux-2-pro", prompt: "x" }),
    (error: unknown) => error instanceof ImageGenerationError && error.isInsufficientCredits,
  );
  assert.equal(calls, 1);
});

test("retries transient server failures before surfacing them", async () => {
  const statuses = [502, 502, 200];
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    const status = statuses[Math.min(calls, statuses.length - 1)];
    calls += 1;
    return status === 200
      ? jsonResponse(200, { model: "flux-2-pro", data: [{ url: "https://example.invalid/ok.png" }] })
      : jsonResponse(status, { error: { type: "server_error", message: "upstream failed" } });
  };
  const client = new ImageGenerationClient({ apiKey: "k", userAgent: "u", fetcher });
  const result = await client.generate({ model: "flux-2-pro", prompt: "x" });
  assert.equal(calls, 3);
  assert.equal(result.data[0]?.url, "https://example.invalid/ok.png");
});

test("aborts image requests through the injected signal", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher: typeof fetch = async (_url, init) => {
    assert.equal((init as RequestInit | undefined)?.signal, controller.signal);
    throw new DOMException("Aborted", "AbortError");
  };
  const client = new ImageGenerationClient({ apiKey: "k", userAgent: "u", fetcher });
  await assert.rejects(client.generate({ model: "flux-2-pro", prompt: "x" }, controller.signal));
});
