/** User-facing Orvix commands and connection workflows. */

import * as vscode from "vscode";
import { OrvixAuth } from "../auth/auth";
import { messageOf } from "../errors";
import { API_BASE, OrvixProvider } from "../provider";

const API_KEYS_URL = "https://platform.orvix.id/api-keys";
const USAGE_URL = "https://platform.orvix.id/usage";

export function registerCommands(
  auth: OrvixAuth,
  provider: OrvixProvider,
  output: vscode.OutputChannel,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("orvixCopilot.manage", () => manage(auth, provider, output)),
    vscode.commands.registerCommand("orvixCopilot.configureApiKey", () => configureApiKey(provider, output)),
    vscode.commands.registerCommand("orvixCopilot.removeApiKey", () => removeApiKey(provider)),
    vscode.commands.registerCommand("orvixCopilot.refreshModels", () => refreshModels(provider)),
    vscode.commands.registerCommand("orvixCopilot.openUsage", () => openUsage()),
    vscode.commands.registerCommand("orvixCopilot.testConnection", () => testConnection(provider, output)),
    vscode.commands.registerCommand("orvixCopilot.openApiKeys", () => openApiKeys()),
    vscode.commands.registerCommand("orvixCopilot.diagnostics", () => diagnostics(auth, output)),
  ];
}

async function manage(auth: OrvixAuth, provider: OrvixProvider, output: vscode.OutputChannel): Promise<void> {
  const configured = await auth.hasApiKey();
  const choices = configured
    ? [
        { label: "$(check) Test Orvix inference", action: "test" },
        { label: "$(refresh) Refresh available models", action: "refresh" },
        { label: "$(graph) Open Orvix usage", action: "usage" },
        { label: "$(key) Replace API key", action: "configure" },
        { label: "$(link-external) Open Orvix API keys", action: "open" },
        { label: "$(output) Show Orvix logs", action: "logs" },
        { label: "$(info) Show diagnostics", action: "diagnostics" },
        { label: "$(trash) Remove API key", action: "remove" },
      ]
    : [
        { label: "$(key) Configure Orvix API key", action: "configure" },
        { label: "$(link-external) Open Orvix API keys", action: "open" },
        { label: "$(output) Show Orvix logs", action: "logs" },
      ];
  const picked = await vscode.window.showQuickPick(choices, {
    title: `Orvix — API key ${configured ? "configured" : "not configured"}`,
  });
  if (!picked) return;
  if (picked.action === "configure") await configureApiKey(provider, output);
  else if (picked.action === "refresh") await refreshModels(provider);
  else if (picked.action === "test") await testConnection(provider, output);
  else if (picked.action === "usage") await openUsage();
  else if (picked.action === "open") await openApiKeys();
  else if (picked.action === "logs") output.show(true);
  else if (picked.action === "diagnostics") await diagnostics(auth, output);
  else if (picked.action === "remove") await removeApiKey(provider);
}

async function configureApiKey(provider: OrvixProvider, output: vscode.OutputChannel): Promise<boolean> {
  const apiKey = await vscode.window.showInputBox({
    title: "Configure Orvix API key",
    prompt: "The key is validated with Orvix, then stored in VS Code Secret Storage.",
    placeHolder: "orv-sk_live_…",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim().startsWith("orv-sk_live_") ? undefined : "Orvix API keys start with orv-sk_live_",
  });
  if (!apiKey) return false;

  try {
    const models = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Validating Orvix API key…",
      },
      () => provider.configureApiKey(apiKey),
    );
    output.appendLine(`[auth] API key configured; models=${models.join(",")}`);
    vscode.window.showInformationMessage(`Orvix connected. Found ${models.length} available models.`);
    return true;
  } catch (error) {
    const message = messageOf(error);
    output.appendLine(`[auth] API key validation failed: ${message}`);
    vscode.window.showErrorMessage(`Orvix API key was not saved: ${message}`);
    return false;
  }
}

async function removeApiKey(provider: OrvixProvider): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    "Remove the Orvix API key from VS Code Secret Storage?",
    { modal: true },
    "Remove API Key",
  );
  if (choice !== "Remove API Key") return;
  await provider.clearApiKey();
  vscode.window.showInformationMessage("Orvix API key removed.");
}

async function refreshModels(provider: OrvixProvider): Promise<void> {
  try {
    const models = await provider.refreshModels();
    vscode.window.showInformationMessage(`Refreshed ${models.length} Orvix models.`);
  } catch (error) {
    vscode.window.showErrorMessage(messageOf(error));
  }
}

async function testConnection(provider: OrvixProvider, output: vscode.OutputChannel): Promise<void> {
  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Testing Orvix inference…",
      },
      () => provider.testConnection(),
    );
    output.appendLine(
      `[test] model=${result.model} effort=${result.reasoningEffort ?? "model-default"} response=${result.text}`,
    );
    vscode.window.showInformationMessage(
      `Orvix verified with ${result.model}${result.reasoningEffort ? ` (${result.reasoningEffort} effort)` : ""}: ${result.text}`,
    );
  } catch (error) {
    const message = messageOf(error);
    output.appendLine(`[test] ${message}`);
    vscode.window.showErrorMessage(`Orvix connection test failed: ${message}`);
  }
}

async function openApiKeys(): Promise<void> {
  const opened = await vscode.env.openExternal(vscode.Uri.parse(API_KEYS_URL));
  if (!opened) vscode.window.showWarningMessage("VS Code could not open the Orvix dashboard.");
}

async function openUsage(): Promise<void> {
  const opened = await vscode.env.openExternal(vscode.Uri.parse(USAGE_URL));
  if (!opened) vscode.window.showWarningMessage("VS Code could not open Orvix usage.");
}

async function diagnostics(auth: OrvixAuth, output: vscode.OutputChannel): Promise<void> {
  const models = await vscode.lm.selectChatModels({ vendor: "orvix" });
  const lines = [
    "# Orvix for Copilot Chat diagnostics",
    "",
    `- VS Code: ${vscode.version}`,
    `- API endpoint: ${API_BASE}`,
    `- API key: ${(await auth.hasApiKey()) ? "configured in Secret Storage" : "missing"}`,
    `- Default reasoning effort: ${vscode.workspace.getConfiguration("orvixCopilot").get("reasoningEffort", "high")}`,
    `- Registered models: ${models.length}`,
    "",
    ...models.map((model) => `- ${model.id} (${model.maxInputTokens} input tokens)`),
  ];
  output.appendLine(`[diagnostics] models=${models.length}`);
  const doc = await vscode.workspace.openTextDocument({
    content: lines.join("\n"),
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
}
