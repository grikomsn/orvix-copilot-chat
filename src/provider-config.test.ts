import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { modelFamily } from "./models/family";

test("declares native API-key configuration without a management-command override", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    contributes: { languageModelChatProviders: Array<Record<string, unknown>> };
  };
  const provider = manifest.contributes.languageModelChatProviders.find((item) => item.vendor === "orvix");
  assert.ok(provider);
  assert.equal(provider.managementCommand, undefined);
  const configuration = provider.configuration as {
    required?: string[];
    properties?: Record<string, { secret?: boolean }>;
  };
  assert.deepEqual(configuration.required, ["apiKey"]);
  assert.equal(configuration.properties?.apiKey.secret, true);
});

test("groups managed models by their native family", () => {
  assert.equal(modelFamily("orvix/muse-spark-1.2"), "muse");
  assert.equal(modelFamily("orvix/deepseek-v4-pro"), "deepseek");
  assert.equal(modelFamily("orvix/auto"), "auto");
});

test("keeps the legacy management commands available for the Secret Storage key", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    contributes: { commands: Array<{ command: string; title: string }> };
  };
  assert.match(
    manifest.contributes.commands.find((item) => item.command === "orvixCopilot.testConnection")?.title ?? "",
    /Test Inference/,
  );
  assert.ok(manifest.contributes.commands.some((item) => item.command === "orvixCopilot.manage"));
  assert.match(
    manifest.contributes.commands.find((item) => item.command === "orvixCopilot.openUsage")?.title ?? "",
    /Open Usage/,
  );
});
