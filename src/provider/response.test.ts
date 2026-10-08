import assert from "node:assert/strict";
import test from "node:test";
import { StreamResponseReporter, type ResponsePartConstructors } from "./response";

class Text { constructor(readonly value: string) {} }
class Thinking { constructor(readonly value: string, readonly id?: string, readonly metadata?: Record<string, unknown>) {} }
class Tool { constructor(readonly callId: string, readonly name: string, readonly input: object) {} }
class Data { constructor(readonly data: Uint8Array, readonly mimeType: string) {} }
const parts = { LanguageModelTextPart: Text, LanguageModelThinkingPart: Thinking,
  LanguageModelToolCallPart: Tool, LanguageModelDataPart: Data } as unknown as ResponsePartConstructors;

test("reports reasoning before text and closes each thinking segment once", () => {
  const output: unknown[] = [];
  const reporter = new StreamResponseReporter({ report: (part) => output.push(part) }, parts, "request-a", () => {});
  reporter.report({ text: "answer", reasoning: "last reasoning" });
  reporter.report({ reasoning: "next reasoning" });
  reporter.report({ toolCalls: [{ id: "", name: "read", arguments: "{}" }] });
  reporter.finish();
  assert.deepEqual(output.map((part) => (part as object).constructor.name), ["Thinking", "Thinking", "Text", "Thinking", "Thinking", "Tool"]);
  assert.deepEqual((output[1] as Thinking).metadata, { vscode_reasoning_done: true });
  assert.deepEqual((output[4] as Thinking).metadata, { vscode_reasoning_done: true });
});

test("EOF and transport failures close thinking and fallback call IDs are request scoped", () => {
  const output: unknown[] = [];
  const first = new StreamResponseReporter({ report: (part) => output.push(part) }, parts, "one", () => {});
  const second = new StreamResponseReporter({ report: (part) => output.push(part) }, parts, "two", () => {});
  first.report({ reasoning: "pending" });
  first.finish(); first.finish();
  first.report({ toolCalls: [{ id: "", name: "read", arguments: "{}" }, { id: "", name: "read", arguments: "{}" }] });
  second.report({ toolCalls: [{ id: "", name: "read", arguments: "{}" }] });
  const tools = output.filter((part): part is Tool => part instanceof Tool);
  assert.equal(new Set(tools.map((tool) => tool.callId)).size, 3);
  assert.equal(output.filter((part) => part instanceof Thinking).length, 2);
});
