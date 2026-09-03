import assert from "node:assert/strict";
import test from "node:test";
import {
  FALLBACK_MODELS,
  enrichModelMetadata,
  formatModelName,
  formatTokenLimit,
  getModelMetadata,
  isOrvixChatModel,
  orderModelMetadata,
  orderModels,
  resolveMaxOutputTokens,
} from "./catalog";

test("accepts Orvix chat model IDs and excludes non-chat families", () => {
  assert.equal(isOrvixChatModel("orvix/auto"), true);
  assert.equal(isOrvixChatModel("orvix/muse-spark-1.2"), true);
  assert.equal(isOrvixChatModel("multilingual-e5-large-instruct"), true);
  assert.equal(isOrvixChatModel("text-embedding-3-large"), false);
  assert.equal(isOrvixChatModel("image/generator"), false);
});

test("orders documented fallback models before other discovered models", () => {
  assert.deepEqual(orderModels(["future-chat", "ORVIX/AUTO", "orvix/auto"]), [
    FALLBACK_MODELS[0],
    "future-chat",
  ]);
});

test("formats model IDs for the VS Code picker", () => {
  assert.equal(formatModelName("orvix/auto"), "Orvix Auto");
  assert.equal(formatModelName("orvix/muse-spark-1.2"), "Muse Spark 1.2");
  assert.equal(formatModelName("orvix/mimo-v2.5-pro"), "MiMo-V2.5-Pro");
  assert.equal(formatModelName("orvix/gpt-5.6-luna"), "GPT-5.6 Luna");
  assert.equal(formatModelName("orvix/deepseek-v4-pro"), "DeepSeek V4 Pro");
  assert.equal(formatModelName("orvix/minimax-m3"), "MiniMax M3");
});

test("provides documented fallback limits", () => {
  assert.deepEqual(getModelMetadata("orvix/muse-spark-1.2"), {
    id: "orvix/muse-spark-1.2",
    name: "Muse Spark 1.2",
    version: "unknown",
    contextLength: 450_000,
    maxOutputTokens: 80_000,
    imageInput: true,
    toolCalling: true,
    reasoningEffort: true,
    cost: undefined,
  });
  assert.equal(formatTokenLimit(1_000_000), "1M");
  assert.equal(formatTokenLimit(262_144), "256K");
  assert.equal(getModelMetadata("orvix/auto").maxOutputTokens, 16_384);
  assert.equal(getModelMetadata("orvix/auto").toolCalling, false);
  assert.equal(getModelMetadata("orvix/deepseek-v4-flash").maxOutputTokens, 384_000);
});

test("uses exactly the discovered catalog and advertised metadata", () => {
  assert.deepEqual(
    orderModelMetadata([
      {
        id: "custom-vision",
        name: "Orvix: Custom Vision",
        context_length: 500_000,
        max_completion_tokens: 64_000,
        input_modalities: ["text", "image"],
      },
      { id: "CUSTOM-VISION", context_length: 1_000_000 },
      { id: "text-embedding-3-large", context_length: 1_000_000 },
    ]),
    [
      {
        id: "custom-vision",
        name: "Custom Vision",
        version: "unknown",
        contextLength: 500_000,
        maxOutputTokens: 64_000,
        imageInput: true,
        toolCalling: false,
        reasoningEffort: false,
        cost: undefined,
      },
    ],
  );
});

test("normalizes managed names instead of trusting provider-prefixed API labels", () => {
  const models = orderModelMetadata([
    { id: "orvix/mimo-v2.5", name: "Orvix MIMO V2.5" },
    { id: "orvix/custom-chat", name: "Orvix Custom Chat" },
  ]);
  assert.equal(models.find(({ id }) => id === "orvix/mimo-v2.5")?.name, "MiMo-V2.5");
  assert.equal(models.find(({ id }) => id === "orvix/custom-chat")?.name, "Custom Chat");
});

test("prefers live nested Orvix capabilities over managed fallbacks", () => {
  const [model] = orderModelMetadata([
    {
      id: "orvix/deepseek-v4-pro",
      capabilities: {
        max_output_tokens: 384_000,
        reasoning_effort: false,
        vision: true,
        tools: false,
      },
    },
  ]);
  assert.equal(model.maxOutputTokens, 384_000);
  assert.equal(model.reasoningEffort, false);
  assert.equal(model.imageInput, true);
  assert.equal(model.toolCalling, false);
});

test("uses live capability flags without sending undocumented reasoning controls", () => {
  const [live] = orderModelMetadata([
    {
      id: "orvix/example",
      tool_calling: false,
      created: 1_700_000_000,
    },
  ]);
  assert.equal(live.toolCalling, false);
  assert.equal(live.reasoningEffort, false);
  assert.equal(live.releaseDate, "2023-11-14");
  assert.equal(getModelMetadata("orvix/auto").reasoningEffort, false);
});

test("keeps unknown models conservative while allowing native metadata enrichment", () => {
  assert.equal(getModelMetadata("orvix/example").toolCalling, false);
  const enriched = enrichModelMetadata(getModelMetadata("example"), {
    id: "example",
    description: "General coding model",
    imageInput: true,
    toolCalling: true,
    releaseDate: "2025-12-01",
  });
  assert.equal(enriched.description, "General coding model");
  assert.equal(enriched.imageInput, true);
  assert.equal(enriched.releaseDate, "2025-12-01");
});

test("uses the official managed route metadata for discovered models", () => {
  const models = orderModelMetadata([
    { id: "orvix/deepseek-v4-pro" },
    { id: "orvix/gemini-3.8-flash" },
    { id: "orvix/glm-5.3-flash" },
    { id: "orvix/mimo-v2.5" },
    { id: "orvix/minimax-m3" },
    { id: "orvix/qwen-3.8-max" },
    { id: "orvix/kimi-k3" },
  ]);
  assert.deepEqual(
    models.map(({ id, contextLength, maxOutputTokens, imageInput, toolCalling, reasoningEffort }) => ({
      id,
      contextLength,
      maxOutputTokens,
      imageInput,
      toolCalling,
      reasoningEffort,
    })),
    [
      {
        id: "orvix/deepseek-v4-pro",
        contextLength: 450_000,
        maxOutputTokens: 384_000,
        imageInput: false,
        toolCalling: true,
        reasoningEffort: true,
      },
      {
        id: "orvix/gemini-3.8-flash",
        contextLength: 450_000,
        maxOutputTokens: 32_000,
        imageInput: true,
        toolCalling: true,
        reasoningEffort: false,
      },
      {
        id: "orvix/glm-5.3-flash",
        contextLength: 450_000,
        maxOutputTokens: 131_072,
        imageInput: false,
        toolCalling: false,
        reasoningEffort: false,
      },
      {
        id: "orvix/kimi-k3",
        contextLength: 450_000,
        maxOutputTokens: 16_384,
        imageInput: false,
        toolCalling: true,
        reasoningEffort: false,
      },
      {
        id: "orvix/mimo-v2.5",
        contextLength: 450_000,
        maxOutputTokens: 128_000,
        imageInput: true,
        toolCalling: true,
        reasoningEffort: false,
      },
      {
        id: "orvix/minimax-m3",
        contextLength: 450_000,
        maxOutputTokens: 32_768,
        imageInput: false,
        toolCalling: true,
        reasoningEffort: false,
      },
      {
        id: "orvix/qwen-3.8-max",
        contextLength: 450_000,
        maxOutputTokens: 32_768,
        imageInput: true,
        toolCalling: true,
        reasoningEffort: false,
      },
    ],
  );
});

test("uses only live pricing because Orvix managed rates are not in the model API", () => {
  const [live] = orderModelMetadata([
    {
      id: "orvix/example",
      pricing: {
        prompt: "0.000001",
        cache_prompt: "0.0000002",
        completion: "0.000002",
      },
    },
  ]);
  assert.deepEqual(live.cost, { input: 1, cacheRead: 0.2, output: 2 });

  const [fallback] = orderModelMetadata([{ id: "orvix/example" }]);
  assert.equal(fallback.cost, undefined);
});

test("falls back only when discovery returns no chat models", () => {
  assert.deepEqual(
    orderModelMetadata([]).map(({ id }) => id),
    [...FALLBACK_MODELS],
  );
});

test("uses the selected catalog limit for default and explicit output settings", () => {
  assert.equal(resolveMaxOutputTokens(0, 65_536), 65_536);
  assert.equal(resolveMaxOutputTokens(100_000, 65_536), 65_536);
  assert.equal(resolveMaxOutputTokens(32_000, 65_536), 32_000);
});
