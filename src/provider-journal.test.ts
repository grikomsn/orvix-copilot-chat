import assert from "node:assert/strict";
import test from "node:test";
import { observeEntry, observedEntries } from "./provider-journal";

test("serializes concurrent observations and stores only model counts and timestamps", async () => {
  const values = new Map<string, unknown>();
  const state = {
    get<T>(key: string): T | undefined { return values.get(key) as T | undefined; },
    async update(key: string, value: unknown): Promise<void> {
      await new Promise<void>((resolve) => setImmediate(resolve)); values.set(key, value);
    },
  };
  await Promise.all([observeEntry(state, "one", 2), observeEntry(state, "two", 3)]);
  assert.deepEqual(Object.keys(observedEntries(state)).sort(), ["one", "two"]);
  assert.deepEqual(Object.keys(observedEntries(state).one).sort(), ["modelCount", "updatedAt"]);
  await Promise.all([observeEntry(state, "one", undefined), observeEntry(state, "three", 4)]);
  assert.deepEqual(Object.keys(observedEntries(state)).sort(), ["three", "two"]);
});

test("failed observation writes do not block later entry mutations", async () => {
  const values = new Map<string, unknown>();
  let failed = false;
  const state = {
    get<T>(key: string): T | undefined { return values.get(key) as T | undefined; },
    async update(key: string, value: unknown): Promise<void> {
      if (!failed) { failed = true; throw new Error("synthetic write failure"); }
      values.set(key, value);
    },
  };
  await assert.rejects(observeEntry(state, "one", 1), /synthetic write failure/);
  await observeEntry(state, "two", 2);
  assert.deepEqual(Object.keys(observedEntries(state)), ["two"]);
});
