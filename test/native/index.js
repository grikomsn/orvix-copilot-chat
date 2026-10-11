const assert = require("node:assert/strict");
const vscode = require("vscode");
const { OrvixAuth } = require("../../out/auth/auth");
const { OrvixProvider } = require("../../out/provider");
const { OrvixImageGenerationTool } = require("../../out/images/vscode-tool");

/** Real VS Code parts and cancellation, synthetic HTTP and credentials only. */
async function run() {
  const source = new vscode.CancellationTokenSource();
  const values = new Map();
  const state = { get: (key) => values.get(key), update: async (key, value) => { values.set(key, value); } };
  const secretValues = new Map();
  const auth = new OrvixAuth({ get: async (key) => secretValues.get(key),
    store: async (key, value) => { secretValues.set(key, value); }, delete: async (key) => { secretValues.delete(key); } });
  const sent = [];
  const signals = [];
  let streamMode = "tools";
  let directoryEmpty = false;
  let pendingBilling;
  const event = (delta, finish_reason, usage) => `data: ${JSON.stringify({ choices: [{ delta, finish_reason }], usage })}\r\n\r\n`;
  const fetcher = async (url, init = {}) => {
    const path = String(url);
    const authorization = new Headers(init.headers).get("Authorization");
    if (path.includes("models.dev")) return Response.json({});
    if (path.endsWith("/models")) return Response.json({ data: directoryEmpty ? [] : [
      { id: "orvix/auto", tool_calling: true, context_length: 32768, max_output_tokens: 4096 },
      { id: "synthetic-byok", tool_calling: true, context_length: 32768, max_output_tokens: 4096 },
    ] });
    if (path.endsWith("/billing")) {
      if (pendingBilling) { const callback = pendingBilling; pendingBilling = undefined; return callback(); }
      return Response.json({ data: { availableMicrousd: authorization === "Bearer synthetic-session-a" ? 111 : 222 } });
    }
    if (path.includes("gateway.orvix.id")) return Response.json({ data: {} });
    if (path.endsWith("/images/generations")) {
      sent.push({ authorization, body: JSON.parse(init.body), image: true });
      return Response.json({ data: [{ b64_json: "aGVsbG8=" }], model: "flux-2-pro" });
    }
    assert.ok(path.endsWith("/chat/completions"));
    const body = JSON.parse(init.body);
    sent.push({ authorization, body });
    signals.push(init.signal);
    const followUp = body.messages.some((message) => message.role === "tool");
    const name = body.tools?.[0]?.function.name ?? "read";
    if (streamMode === "error") {
      let first = true;
      return new Response(new ReadableStream({ pull(controller) {
        if (first) { first = false; controller.enqueue(new TextEncoder().encode(event({ reasoning_content: "synthetic" }))); }
        else controller.error(new Error("synthetic stream failure"));
      } }));
    }
    if (streamMode === "incomplete") return new Response(event({ reasoning_content: "synthetic" }));
    if (streamMode === "cancel") return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(event({ content: "synthetic" })));
      init.signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
    } }));
    const content = followUp ? event({ content: "synthetic final" }, "stop", { prompt_tokens: 10, completion_tokens: 5 }) :
      event({ reasoning_content: "synthetic plan" }) + event({ tool_calls: [
        { index: 0, id: "a", function: { name, arguments: '{"value":"' } },
        { index: 1, id: "b", function: { name, arguments: '{"value":"' } },
        { index: 2, function: { name, arguments: '{}' } },
      ] }) + event({ tool_calls: [{ id: "b", function: { arguments: 'b"}' } }] }) +
      event({ tool_calls: [{ id: "a", function: { arguments: 'a"}' } }] }, "tool_calls", { prompt_tokens: 10, completion_tokens: 5 });
    return new Response(new ReadableStream({ start(controller) {
      for (const character of content + "data: [DONE]\r\n\r\n") controller.enqueue(new TextEncoder().encode(character));
      controller.close();
    } }));
  };
  const provider = new OrvixProvider(auth, { appendLine() {} }, "native-test", state, {}, fetcher);
  const prepare = async (apiKey) => provider.provideLanguageModelChatInformation({ silent: true,
    configuration: { apiKey } }, source.token);
  const options = { requestInitiator: "native-test", tools: [{ name: "read", description: "Synthetic", inputSchema: { type: "object" } }] };
  try {
    const aModels = await prepare("orv-sk_live_synthetic_a");
    const bModels = await prepare("orv-sk_live_synthetic_b");
    const a = aModels.find((model) => model.rawModelId === "orvix/auto");
    const b = bModels.find((model) => model.rawModelId === "synthetic-byok");
    assert.notEqual(a.credentialRef, b.credentialRef);
    assert.equal(provider.getFeatureApiKey(), "orv-sk_live_synthetic_b", "Active key follows the most recent provisioning");
    const output = [];
    await provider.provideLanguageModelChatResponse(a, [vscode.LanguageModelChatMessage.User("synthetic prompt")], options,
      { report: (part) => output.push(part) }, source.token);
    const calls = output.filter((part) => part instanceof vscode.LanguageModelToolCallPart);
    assert.equal(calls.length, 3);
    assert.equal(new Set(calls.map((part) => part.callId)).size, 3);
    assert.equal(output[1].metadata.vscode_reasoning_done, true);
    assert.equal(sent.at(-1).authorization, "Bearer orv-sk_live_synthetic_a");
    assert.equal(sent.at(-1).body.model, "orvix/auto");
    const history = [vscode.LanguageModelChatMessage.User("synthetic prompt"), vscode.LanguageModelChatMessage.Assistant(calls),
      vscode.LanguageModelChatMessage.User(calls.map((call) => new vscode.LanguageModelToolResultPart(call.callId,
        [new vscode.LanguageModelTextPart("synthetic result")])))];
    await provider.provideLanguageModelChatResponse(b, history, options, { report() {} }, source.token);
    assert.equal(sent.at(-1).body.messages.filter((message) => message.role === "tool").length, 3);
    assert.equal(sent.at(-1).body.model, "synthetic-byok");
    assert.equal(sent.at(-1).authorization, "Bearer orv-sk_live_synthetic_b");
    assert.equal(provider.getUsageSnapshot(a.credentialRef).tracked.requests, 1);
    assert.equal(provider.getUsageSnapshot(b.credentialRef).tracked.requests, 1);
    const image = new OrvixImageGenerationTool({ resolveApiKey: async () => provider.getFeatureApiKey(),
      resolveDefaultModel: () => "flux-2-pro", userAgent: "native-test", fetcher });
    await image.invoke({ input: { prompt: "synthetic prompt" } }, source.token);
    assert.equal(sent.at(-1).authorization, "Bearer orv-sk_live_synthetic_b");
    // Billing sessions are bound to one credential: the active one at import time.
    await provider.configureGatewaySession({ token: "synthetic-session-a" });
    assert.equal(provider.getUsageSnapshot(b.credentialRef).credits.availableMicrousd, 111);
    assert.equal(provider.getUsageSnapshot(a.credentialRef).credits, undefined);
    await provider.refreshUsage(false, a.credentialRef);
    assert.equal(provider.getUsageSnapshot(a.credentialRef).credits, undefined);
    await prepare("orv-sk_live_synthetic_a");
    await provider.configureGatewaySession({ token: "synthetic-session-b" });
    assert.equal(provider.getUsageSnapshot(a.credentialRef).credits.availableMicrousd, 222);
    assert.equal(provider.getUsageSnapshot(b.credentialRef).credits.availableMicrousd, 111);
    const persisted = values.get("orvixCopilot.entryUsage.v1");
    assert.equal(Object.values(persisted).some((snapshot) => snapshot.credits || snapshot.account), false);
    let releaseBilling;
    pendingBilling = () => new Promise((resolve) => { releaseBilling = resolve; });
    const oldRefresh = provider.refreshUsage(false, a.credentialRef);
    while (!releaseBilling) await new Promise((resolve) => setImmediate(resolve));
    const rotated = (await prepare("orv-sk_live_synthetic_rotated"))[0];
    releaseBilling(Response.json({ data: { availableMicrousd: 999 } }));
    await oldRefresh;
    assert.equal(provider.getUsageSnapshot(rotated.credentialRef).credits, undefined);
    // A gateway session stays bound to its own credential across rotations.
    assert.equal((await auth.getGatewaySession(a.credentialRef))?.token, "synthetic-session-b");
    const stale = (await prepare("orv-sk_live_synthetic_rotated"))[0];
    assert.equal(await provider.refreshUsage(false, stale.credentialRef).then(() => true, () => false), true);
    // Key-scoped credentials keep handles valid while their key stays provisioned.
    const returned = (await prepare("orv-sk_live_synthetic_a"))[0];
    assert.equal(returned.id, a.id);
    assert.equal(returned.credentialRef, a.credentialRef);
    for (const mode of ["incomplete", "error"]) {
      streamMode = mode;
      const parts = [];
      await assert.rejects(provider.provideLanguageModelChatResponse(returned, [], options,
        { report: (part) => parts.push(part) }, source.token), mode === "incomplete" ? /completion reason/ : /synthetic stream failure/);
      assert.equal(parts.at(-1).metadata.vscode_reasoning_done, true);
      assert.equal(signals.at(-1).aborted, true);
    }
    streamMode = "cancel";
    const cancellation = new vscode.CancellationTokenSource();
    await provider.provideLanguageModelChatResponse(returned, [], options, { report() { cancellation.cancel(); } }, cancellation.token);
    assert.equal(signals.at(-1).aborted, true);
    cancellation.dispose();
    directoryEmpty = true;
    assert.deepEqual(await prepare("orv-sk_live_synthetic_empty"), []);
  } finally {
    source.dispose();
  }
  console.log(JSON.stringify({ provider: "orvix", passed: true,
    nativeChecks: "parallel entries, reasoning closure, raw routing, tool follow-up, inference usage, billing by credential, stale refresh, rotation, incomplete/error/cancellation cleanup" }));
}
module.exports = { run };
