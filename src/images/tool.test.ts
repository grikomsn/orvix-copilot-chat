import assert from "node:assert/strict";
import test from "node:test";
import {
  coerceImageInput,
  formatImageResult,
  imageInvocationMessage,
  imageToolCredits,
  fetchInlineImage,
  inlineImageMime,
  inlineImageSources,
} from "./tool-logic";

test("formats image results with the credits spent", () => {
  const single = formatImageResult(
    { created: 1, model: "flux-2-pro", data: [{ url: "https://example.invalid/a.png" }] },
    7,
  );
  assert.match(single, /^Generated 1 image with flux-2-pro \(7 Image Credits spent\)\./);
  assert.match(single, /https:\/\/example\.invalid\/a\.png/);

  const multiple = formatImageResult(
    {
      created: 1,
      model: "gpt-image-2",
      data: [{ url: "https://example.invalid/1.png" }, { url: "https://example.invalid/2.png" }],
    },
    22,
  );
  assert.match(multiple, /Generated 2 images with gpt-image-2 \(22 Image Credits spent\)/);
  assert.match(multiple, /1\. https:\/\/example\.invalid\/1\.png/);
  assert.match(multiple, /2\. https:\/\/example\.invalid\/2\.png/);

  const base64 = formatImageResult({ model: "midjourney", data: [{ b64Json: "abc" }] }, 22);
  assert.match(base64, /\[base64 image data returned inline\]/);

  const empty = formatImageResult({ model: "flux-2-pro", data: [] }, 0);
  assert.match(empty, /returned no images/);
});

test("computes credits from bundled and live catalogue costs", () => {
  assert.equal(imageToolCredits("orvix/flux-2-pro", 2), 14);
  assert.equal(imageToolCredits("midjourney", 4), 22);
  assert.equal(imageToolCredits("seedream-5.0-pro", 3), 19);
  assert.equal(imageToolCredits("unknown", 2), 0);
  assert.equal(
    imageToolCredits("flux-2-pro", 1, [{ model: "flux-2-pro", imageCreditCost: 9, enabled: true, available: true }]),
    9,
  );
  assert.equal(
    imageToolCredits("flux-2-pro", 2, [{ model: "other-model", imageCreditCost: 9, enabled: true, available: true }]),
    14,
  );
});

test("coerces raw tool input into validated generation input", () => {
  const coerced = coerceImageInput({ model: "orvix/flux-2-pro", prompt: " A cat ", n: 2, size: "1024x1024" });
  assert.deepEqual(coerced, { model: "orvix/flux-2-pro", prompt: "A cat", n: 2, size: "1024x1024" });

  assert.equal(coerceImageInput({ model: "flux-2-pro", prompt: "   " }), "A non-empty prompt is required");
  // Unknown models fall back to the configured/bundled default instead of
  // failing, so a caller's bad model guess can never block generation.
  assert.deepEqual(coerceImageInput({ model: "muse-spark-1.2", prompt: "x" }), { model: "flux-2-pro", prompt: "x" });

  const withFormat = coerceImageInput({ model: "gpt-image-2", prompt: "x", response_format: "b64_json" });
  assert.deepEqual(withFormat, { model: "gpt-image-2", prompt: "x", responseFormat: "b64_json" });
  const droppedFormat = coerceImageInput({ model: "gpt-image-2", prompt: "x", response_format: "weird" });
  assert.deepEqual(droppedFormat, { model: "gpt-image-2", prompt: "x" });
});

test("falls back to the configured or bundled default when model is omitted", () => {
  // No model and no configured default: bundled default (cheapest).
  assert.deepEqual(coerceImageInput({ prompt: "x" }), { model: "flux-2-pro", prompt: "x" });
  // A configured default wins over the bundled default.
  assert.deepEqual(coerceImageInput({ prompt: "x" }, "gemini-3-pro-image"), {
    model: "gemini-3-pro-image",
    prompt: "x",
  });
  // An explicit model always wins over the default.
  assert.deepEqual(coerceImageInput({ model: "gpt-image-2", prompt: "x" }, "gemini-3-pro-image"), {
    model: "gpt-image-2",
    prompt: "x",
  });
  // orvix/-prefixed defaults are canonicalized.
  assert.deepEqual(coerceImageInput({ prompt: "x" }, "orvix/midjourney"), { model: "orvix/midjourney", prompt: "x" });
  // An unknown configured default falls back to the bundled default.
  assert.deepEqual(coerceImageInput({ prompt: "x" }, "not-a-model"), { model: "flux-2-pro", prompt: "x" });
  // Blank configured default falls back too.
  assert.deepEqual(coerceImageInput({ prompt: "x" }, "   "), { model: "flux-2-pro", prompt: "x" });
});

test("invocation messages surface the default-model fallback", () => {
  assert.match(
    imageInvocationMessage({ prompt: "A sunset" }, "orvix/gemini-3-pro-image"),
    /Generating “A sunset” with orvix\/gemini-3-pro-image \[default model\] \(costs 61 Image Credits\)/,
  );
  // Explicit model selection does not claim the default.
  assert.doesNotMatch(
    imageInvocationMessage({ model: "midjourney", prompt: "x" }, "flux-2-pro"),
    /\[default model\]/,
  );
});

test("builds invocation messages with the estimated cost", () => {
  assert.match(
    imageInvocationMessage({ model: "orvix/gemini-3-pro-image", prompt: "A sunset" }),
    /Generating “A sunset” with orvix\/gemini-3-pro-image \(costs 61 Image Credits\)/,
  );
  assert.match(
    imageInvocationMessage({ model: "midjourney", n: 4, prompt: "grid" }),
    /costs 22 Image Credits/,
  );
  // Missing model without a configured default names the bundled default.
  assert.match(
    imageInvocationMessage({ prompt: "x" }),
    /with flux-2-pro \[default model\]/,
  );
});

test("collects inline sources from urls and b64 entries", async () => {
  const sources = inlineImageSources([
    { url: "https://cdn.example.invalid/a.jpg" },
    { b64Json: Buffer.from("hello image").toString("base64") },
    { url: "ftp://not-http.example.invalid/x.png" },
    { b64Json: "data:image/png;base64," + Buffer.from("png bytes").toString("base64") },
    { b64Json: "!" }, // invalid base64 decodes to zero bytes
    {},
  ]);
  assert.equal(sources.length, 6);
  assert.deepEqual(sources[0], { source: "url", url: "https://cdn.example.invalid/a.jpg" });
  assert.equal(sources[1] && sources[1].source === "b64" && new TextDecoder().decode(sources[1].bytes), "hello image");
  assert.equal(sources[1] && sources[1].source === "b64" && sources[1].mimeType, "image/jpeg");
  assert.equal(sources[2], undefined); // non-http(s) URL never inlined
  const png = sources[3];
  assert.equal(png && png.source === "b64" && new TextDecoder().decode(png.bytes), "png bytes");
  assert.equal(png && png.source === "b64" && png.mimeType, "image/png");
  assert.equal(sources[4], undefined);
  assert.equal(sources[5], undefined);

  // Oversized base64 is rejected before decoding.
  const oversized = inlineImageSources(
    [{ b64Json: "A".repeat(16 * 1024 * 1024) }],
    10 * 1024 * 1024,
  );
  assert.equal(oversized[0], undefined);

  // Content-type mapping for fetched bytes.
  assert.equal(inlineImageMime("image/png"), "image/png");
  assert.equal(inlineImageMime("image/jpeg; charset=binary"), "image/jpeg");
  assert.equal(inlineImageMime("application/octet-stream"), "image/jpeg");
  assert.equal(inlineImageMime(null), "image/jpeg");

  // Byte fetch honors status, declared size, and actual size.
  const bytes = new Uint8Array([1, 2, 3]);
  const ok = await fetchInlineImage("https://x.example.invalid/a", async () =>
    new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } }),
  );
  assert.ok(ok);
  assert.deepEqual([...(ok?.bytes ?? [])], [1, 2, 3]);
  assert.equal(ok?.contentType, "image/png");

  const httpError = await fetchInlineImage("https://x.example.invalid/a", async () =>
    new Response("nope", { status: 404 }),
  );
  assert.equal(httpError, undefined);

  const tooBig = await fetchInlineImage(
    "https://x.example.invalid/a",
    async () => new Response(new Uint8Array(11), { status: 200 }),
    10,
  );
  assert.equal(tooBig, undefined);

  const declaredTooBig = await fetchInlineImage(
    "https://x.example.invalid/a",
    async () => new Response(bytes, { status: 200, headers: { "Content-Length": "999999" } }),
    10,
  );
  assert.equal(declaredTooBig, undefined);

  const networkFail = await fetchInlineImage("https://x.example.invalid/a", async () => {
    throw new Error("boom");
  });
  assert.equal(networkFail, undefined);
});
