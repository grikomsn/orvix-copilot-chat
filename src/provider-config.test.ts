import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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

test("declares the image-generation language-model tool", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    contributes: {
      languageModelTools?: Array<{
        name: string;
        toolReferenceName: string;
        displayName: string;
        canBeReferencedInPrompt: boolean;
        inputSchema: {
          type: string;
          required: string[];
          properties: Record<string, { type?: string; description?: string }>;
          additionalProperties: boolean;
        };
      }>;
    };
  };
  const tool = manifest.contributes.languageModelTools?.find(
    (item) => item.name === "orvix-copilot-chat_generateImage",
  );
  assert.ok(tool, "image generation tool contribution is missing");
  assert.equal(tool.toolReferenceName, "orvixImages");
  assert.match(tool.displayName, /Image Generation/);
  assert.equal(tool.canBeReferencedInPrompt, true);
  assert.equal(tool.inputSchema.type, "object");
  assert.deepEqual(tool.inputSchema.required, ["prompt"]);
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.match(tool.inputSchema.properties.model?.description ?? "", /flux-2-pro/);
  assert.match(tool.inputSchema.properties.model?.description ?? "", /default image model/);
  assert.match(tool.inputSchema.properties.prompt?.description ?? "", /Non-empty/);
  assert.equal(tool.inputSchema.properties.n?.type, "integer");
  assert.deepEqual(tool.inputSchema.properties.response_format?.type, "string");
});

test("declares the default image model setting and command", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    contributes: {
      commands: Array<{ command: string; title: string }>;
      configuration: {
        properties: Record<string, { type?: string; default?: unknown; enum?: string[] }>;
      };
    };
  };
  assert.match(
    manifest.contributes.commands.find((item) => item.command === "orvixCopilot.setDefaultImageModel")?.title ?? "",
    /Set Default Image Model/,
  );
  const setting = manifest.contributes.configuration.properties["orvixCopilot.defaultImageModel"];
  assert.ok(setting, "defaultImageModel setting is missing");
  assert.equal(setting.type, "string");
  assert.equal(setting.default, "flux-2-pro");
  assert.ok(setting.enum?.includes("flux-2-pro"));
  assert.ok(setting.enum?.includes("gemini-3-pro-image"));
});
