import assert from "node:assert/strict";
import test from "node:test";
import {
  MODELS_DEV_API_URL,
  ModelsDevMetadata,
  normalizeModelsDevSnapshot,
  resolveModelsDevMetadata,
  type MetadataCache,
} from "./metadata";

class Cache implements MetadataCache {
  value: unknown;
  get<T>(): T | undefined {
    return this.value as T;
  }
  async update(_key: string, value: unknown): Promise<void> {
    this.value = value;
  }
}
const payload = {
  openai: {
    models: {
      m: {
        id: "m",
        description: "Model",
        limit: { context: 100, output: 20 },
        modalities: { input: ["text", "image"] },
        tool_call: true,
        reasoning: true,
        reasoning_options: [{ type: "effort", values: ["none", "high"] }],
        release_date: "2026-01-01",
        cost: { input: 0.5, output: 2, cache_read: 0.1 },
      },
    },
  },
};

test("normalizes provider-qualified models.dev metadata", () => {
  const snapshot = normalizeModelsDevSnapshot(payload, 1);
  assert.deepEqual(snapshot.models["openai/m"], {
    id: "m",
    description: "Model",
    contextLength: 100,
    maxOutputTokens: 20,
    imageInput: true,
    toolCalling: true,
    reasoning: true,
    reasoningOptions: ["none", "high"],
    releaseDate: "2026-01-01",
    cost: { input: 0.5, output: 2, cacheRead: 0.1 },
  });
  assert.equal(resolveModelsDevMetadata(snapshot, "orvix/m"), undefined);
  assert.equal(resolveModelsDevMetadata(snapshot, "m", "orvix"), undefined);
  assert.equal(resolveModelsDevMetadata(snapshot, "m", "openai")?.description, "Model");
});

test("round-trips upstream cost through the persisted cache", () => {
  const cache = new Cache();
  const metadata = new ModelsDevMetadata(
    cache,
    async () => Response.json(payload),
    () => 1,
  );
  return metadata.getOrRefresh().then((snapshot) => {
    const model = snapshot.models["openai/m"];
    assert.deepEqual(model?.cost, { input: 0.5, output: 2, cacheRead: 0.1 });
    // A second instance loads the cached snapshot with cost intact.
    const restored = new ModelsDevMetadata(cache, async () => new Response("down", { status: 503 }), () => 2);
    return restored.getOrRefresh().then((restoredSnapshot) => {
      assert.deepEqual(restoredSnapshot.models["openai/m"]?.cost, { input: 0.5, output: 2, cacheRead: 0.1 });
    });
  });
});

test("persists metadata and falls back to the snapshot after refresh failure", async () => {
  const cache = new Cache();
  const metadata = new ModelsDevMetadata(
    cache,
    async (input) => {
      assert.equal(String(input), MODELS_DEV_API_URL);
      return Response.json(payload);
    },
    () => 1,
  );
  assert.equal((await metadata.getOrRefresh()).models["openai/m"]?.description, "Model");
  const stale = new ModelsDevMetadata(
    cache,
    async () => new Response("down", { status: 503 }),
    () => 99_999_999,
  );
  assert.equal((await stale.refresh()).models["openai/m"]?.description, "Model");
});
