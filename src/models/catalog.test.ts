import assert from "node:assert/strict";
import test from "node:test";
import {
  advertisedModelLimits,
  FALLBACK_MODELS,
  enrichModelMetadata,
  formatModelName,
  formatTokenLimit,
  getModelMetadata,
  isOrvixChatModel,
  orderModelMetadata,
  orderModels,
  resolveMaxInputTokens,
  resolveMaxOutputTokens,
} from "./catalog";

test("accepts Orvix chat model IDs and excludes non-chat families", () => {
  assert.equal(isOrvixChatModel("orvix/auto"), true);
  assert.equal(isOrvixChatModel("orvix/muse-spark-1.2"), true);
  assert.equal(isOrvixChatModel("multilingual-e5-large-instruct"), true);
  assert.equal(isOrvixChatModel("text-embedding-3-large"), false);
  assert.equal(isOrvixChatModel("image/generator"), false);
  assert.equal(isOrvixChatModel("orvix/flux-2-pro"), false);
  assert.equal(isOrvixChatModel("orvix/midjourney"), false);
  assert.equal(isOrvixChatModel("orvix/seedream-5.0-pro"), false);
  assert.equal(isOrvixChatModel("orvix/grok-4.7"), true);
  assert.equal(isOrvixChatModel("orvix/grok-4.7:free"), true);
  assert.equal(isOrvixChatModel("orvix/atria-dawn-preview"), true);
  assert.equal(isOrvixChatModel("orvix/jev"), true);
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
  assert.equal(formatModelName("orvix/glm-5.2"), "GLM 5.2");
  assert.equal(formatModelName("orvix/gpt-5.6-luna"), "GPT-5.6 Luna");
  assert.equal(formatModelName("orvix/gpt-5.6-sol"), "GPT-5.6 Sol");
  assert.equal(formatModelName("orvix/gpt-5.6-terra"), "GPT-5.6 Terra");
  assert.equal(formatModelName("orvix/grok-4.6"), "Grok 4.6");
  assert.equal(formatModelName("orvix/grok-4.7"), "Grok 4.7");
  assert.equal(formatModelName("orvix/grok-4.7:free"), "Grok 4.7 (Free)");
  assert.equal(formatModelName("orvix/atria-dawn-preview"), "Atria Dawn Preview");
  assert.equal(formatModelName("orvix/jev"), "Jev");
  // Unknown free routes render a prettified "(Free)" suffix instead of
  // leaking the raw `:free` token into the picker label.
  assert.equal(formatModelName("orvix/kimi-k3:free"), "Kimi K3 (Free)");
  assert.equal(formatModelName("orvix/deepseek-v4-flash:free"), "DeepSeek V4 Flash (Free)");
  assert.equal(formatModelName("orvix/qwen-3.8-flash"), "Qwen 3.8 Flash");
  assert.equal(formatModelName("orvix/deepseek-v4-pro"), "DeepSeek V4 Pro");
  assert.equal(formatModelName("orvix/minimax-m3"), "MiniMax M3");
});

test("formats unknown managed models with vendor casing for future catalog entries", () => {
  assert.equal(formatModelName("orvix/gpt-5.7-sol"), "GPT 5.7 Sol");
  assert.equal(formatModelName("orvix/qwen-4-flash"), "Qwen 4 Flash");
  assert.equal(formatModelName("orvix/kimi-k4"), "Kimi K4");
  assert.equal(formatModelName("orvix/deepseek-v5-lite"), "DeepSeek V5 Lite");
  assert.equal(formatModelName("orvix/minimax-m4"), "MiniMax M4");
  assert.equal(formatModelName("orvix/mimo-v3"), "MiMo V3");
  assert.equal(formatModelName("orvix/glm-6-flash"), "GLM 6 Flash");
  assert.equal(formatModelName("orvix/qwen-4-vl"), "Qwen 4 VL");
  assert.equal(formatModelName("orvix/grok-5"), "Grok 5");
  assert.equal(formatModelName("orvix/gemini-4.0-pro"), "Gemini 4.0 Pro");
  assert.equal(formatModelName("orvix/foo-ai"), "Foo AI");
});

test("keeps unprefixed BYOK names without a vendor prefix", () => {
  assert.equal(formatModelName("my-finetune-v2"), "My Finetune V2");
  assert.equal(formatModelName("custom-vision"), "Custom Vision");
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
    cost: { input: 1.25, output: 4.25, cacheRead: 0.15 },
  });
  assert.equal(formatTokenLimit(1_000_000), "1M");
  assert.equal(formatTokenLimit(262_144), "256K");
  assert.equal(getModelMetadata("orvix/auto").maxOutputTokens, 384_000);
  assert.equal(getModelMetadata("orvix/auto").toolCalling, true);
  assert.equal(getModelMetadata("orvix/auto").cost, undefined);
  assert.equal(getModelMetadata("orvix/deepseek-v4-flash").maxOutputTokens, 384_000);
});

test("mirrors live capabilities for newly added managed models", () => {
  assert.deepEqual(getModelMetadata("orvix/glm-5.2"), {
    id: "orvix/glm-5.2",
    name: "GLM 5.2",
    version: "unknown",
    contextLength: 450_000,
    maxOutputTokens: 32_768,
    imageInput: false,
    toolCalling: true,
    reasoningEffort: true,
    cost: { input: 1.4, output: 4.4, cacheRead: 0.26 },
  });
  assert.equal(getModelMetadata("orvix/gpt-5.6-sol").imageInput, true);
  assert.equal(getModelMetadata("orvix/gpt-5.6-sol").maxOutputTokens, 128_000);
  assert.equal(getModelMetadata("orvix/gpt-5.6-terra").reasoningEffort, true);
  assert.equal(getModelMetadata("orvix/grok-4.6").imageInput, true);
  assert.equal(getModelMetadata("orvix/grok-4.6").reasoningEffort, false);
  assert.deepEqual(getModelMetadata("orvix/grok-4.7"), {
    id: "orvix/grok-4.7",
    name: "Grok 4.7",
    version: "unknown",
    contextLength: 450_000,
    maxOutputTokens: 32_768,
    imageInput: true,
    toolCalling: true,
    reasoningEffort: false,
    cost: { input: 2, output: 6, cacheRead: 0.5 },
  });
  assert.equal(getModelMetadata("orvix/gpt-5.6-luna:free").reasoningEffort, true);
  // Free routes inherit their paid id's ceilings but are never billed per
  // token, so cost stays unset even when the paid entry carries an estimate.
  assert.equal(getModelMetadata("orvix/gpt-5.6-luna:free").cost, undefined);
  assert.equal(getModelMetadata("orvix/gpt-5.6-luna:free").maxOutputTokens, 128_000);
  assert.equal(getModelMetadata("orvix/kimi-k3:free").maxOutputTokens, 16_384);
  assert.equal(getModelMetadata("orvix/kimi-k3:free").cost, undefined);
  assert.deepEqual(getModelMetadata("orvix/deepseek-v4.1-flash"), {
    id: "orvix/deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    version: "unknown",
    contextLength: 450_000,
    maxOutputTokens: 131_072,
    imageInput: false,
    toolCalling: true,
    reasoningEffort: true,
    cost: { input: 0.15, output: 0.6, cacheRead: 0.003 },
  });
  assert.deepEqual(getModelMetadata("orvix/mimo-v2.6-pro"), {
    id: "orvix/mimo-v2.6-pro",
    name: "MiMo-V2.6-Pro",
    version: "unknown",
    contextLength: 450_000,
    maxOutputTokens: 128_000,
    imageInput: false,
    toolCalling: true,
    reasoningEffort: false,
    cost: { input: 0.435, output: 0.87, cacheRead: 0.0036 },
  });
  assert.deepEqual(getModelMetadata("orvix/hy3"), {
    id: "orvix/hy3",
    name: "Hy3",
    version: "unknown",
    contextLength: 450_000,
    maxOutputTokens: 32_768,
    imageInput: false,
    toolCalling: true,
    reasoningEffort: true,
    cost: { input: 0.132, output: 0.528, cacheRead: 0.033 },
  });
  assert.deepEqual(getModelMetadata("orvix/hy4-preview"), {
    id: "orvix/hy4-preview",
    name: "Hy4 Preview",
    version: "unknown",
    contextLength: 450_000,
    maxOutputTokens: 32_768,
    imageInput: false,
    toolCalling: true,
    reasoningEffort: true,
    cost: { input: 0.834, output: 2.501, cacheRead: 0.042 },
  });
  // Retired :free routes stay out of the bundled map but still resolve via
  // paid-id inheritance with cost unset.
  assert.equal(getModelMetadata("orvix/glm-5.3-flash:free").maxOutputTokens, 131_072);
  assert.equal(getModelMetadata("orvix/glm-5.3-flash:free").cost, undefined);
  assert.equal(getModelMetadata("orvix/grok-4.7:free").maxOutputTokens, 32_768);
  assert.equal(getModelMetadata("orvix/grok-4.7:free").cost, undefined);
  assert.equal(getModelMetadata("orvix/atria-dawn-preview").maxOutputTokens, 32_768);
  assert.equal(getModelMetadata("orvix/atria-dawn-preview").toolCalling, false);
  assert.equal(getModelMetadata("orvix/jev").maxOutputTokens, 32_000);
  assert.equal(getModelMetadata("orvix/qwen-3.8-flash").imageInput, false);
  assert.equal(getModelMetadata("orvix/qwen-3.8-flash").maxOutputTokens, 65_536);
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
  assert.equal(getModelMetadata("orvix/auto").reasoningEffort, true);
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
        imageInput: true,
        toolCalling: true,
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
  // An unknown model has no upstream estimate, so it stays undefined.
  assert.equal(fallback.cost, undefined);

  // A managed model falls back to its bundled best-effort upstream estimate.
  const [managed] = orderModelMetadata([{ id: "orvix/gpt-5.6-sol" }]);
  assert.deepEqual(managed.cost, { input: 4, output: 20, cacheRead: 0.4 });
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

test("honors live shared windows independently of output capability", () => {
  for (const output of [100_000, 200_000]) {
    const [model] = orderModelMetadata([{ id: "orvix/example", context_length: 100_000, max_output_tokens: output }]);
    assert.equal(model.contextLength, 100_000);
    assert.equal(resolveMaxInputTokens(model), 67_232);
  }
  const [model] = orderModelMetadata([{ id: "orvix/deepseek-v4-flash", context_length: 100_000 }]);
  assert.equal(model.contextLength, 100_000);
  assert.equal(resolveMaxInputTokens(model), 67_232);
});

test("reserves a usable input budget even when output capability fills the window", () => {
  for (const contextLength of [229_376, 262_144, 450_000, 1_048_576]) {
    const limits = advertisedModelLimits({ contextLength, maxOutputTokens: contextLength });
    assert.equal(limits.maxInputTokens, contextLength - 32_768);
    assert.equal(limits.maxOutputTokens, 32_768);
    const configured = advertisedModelLimits({ contextLength, maxOutputTokens: 131_072 }, 16_384);
    assert.equal(configured.maxInputTokens + configured.maxOutputTokens, contextLength);
    assert.equal(configured.maxOutputTokens, 16_384);
  }
});

test("every supported fallback has room for conversation and a bounded response", () => {
  for (const id of FALLBACK_MODELS) {
    const metadata = getModelMetadata(id);
    const limits = advertisedModelLimits(metadata);
    assert.ok(limits.maxInputTokens > 32_768, id);
    assert.ok(limits.maxOutputTokens > 0 && limits.maxOutputTokens <= 32_768, id);
    assert.equal(limits.maxInputTokens + limits.maxOutputTokens, metadata.contextLength, id);
  }
});
