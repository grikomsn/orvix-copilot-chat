/** User-facing Orvix commands and connection workflows. */

import * as vscode from "vscode";
import { OrvixAuth } from "../auth/auth";
import { messageOf } from "../errors";
import { API_BASE, OrvixProvider } from "../provider";
import { formatUsageRows } from "../usage/domain";
import { toUsageQuickPickItem, type UsageQuickPickItem } from "../usage/presentation";

const API_KEYS_URL = "https://platform.orvix.id/api-keys";
const USAGE_URL = "https://platform.orvix.id/usage";
const BILLING_URL = "https://platform.orvix.id/billing";

export function registerCommands(
  auth: OrvixAuth,
  provider: OrvixProvider,
  output: vscode.OutputChannel,
  usageStatus?: vscode.StatusBarItem,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("orvixCopilot.manage", () => manage(auth, provider, output, usageStatus)),
    vscode.commands.registerCommand("orvixCopilot.configureApiKey", () => configureApiKey(provider, output)),
    vscode.commands.registerCommand("orvixCopilot.configureGatewaySession", () => configureGatewaySession(provider, output)),
    vscode.commands.registerCommand("orvixCopilot.removeApiKey", () => removeApiKey(provider)),
    vscode.commands.registerCommand("orvixCopilot.removeGatewaySession", () => removeGatewaySession(provider)),
    vscode.commands.registerCommand("orvixCopilot.refreshModels", () => refreshModels(provider)),
    vscode.commands.registerCommand("orvixCopilot.openUsage", () => openUsage()),
    vscode.commands.registerCommand("orvixCopilot.showUsage", () => showUsage(provider, output, usageStatus)),
    vscode.commands.registerCommand("orvixCopilot.testConnection", () => testConnection(provider, output)),
    vscode.commands.registerCommand("orvixCopilot.openApiKeys", () => openApiKeys()),
    vscode.commands.registerCommand("orvixCopilot.diagnostics", () => diagnostics(auth, output)),
  ];
}

async function manage(
  auth: OrvixAuth,
  provider: OrvixProvider,
  output: vscode.OutputChannel,
  usageStatus?: vscode.StatusBarItem,
): Promise<void> {
  const configured = await auth.hasApiKey();
  const choices = configured
    ? [
        { label: "$(check) Test Orvix inference", action: "test" },
        { label: "$(refresh) Refresh available models", action: "refresh" },
        { label: "$(credit-card) Show usage and credits", action: "usage" },
        { label: "$(graph) Open Orvix usage", action: "open-usage" },
        { label: "$(account) Import usage session", action: "session" },
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
  else if (picked.action === "usage") await showUsage(provider, output, usageStatus);
  else if (picked.action === "session") await configureGatewaySession(provider, output);
  else if (picked.action === "open-usage") await openUsage();
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

async function configureGatewaySession(provider: OrvixProvider, output: vscode.OutputChannel): Promise<boolean> {
  // Extract the session object JSON from the platform page. It looks like
  // {"token":"...","refreshToken":"...","user":{...}}.
  const raw = await vscode.window.showInputBox({
    title: "Import Orvix browser session",
    prompt:
      "Open platform.orvix.id, run `JSON.parse(localStorage['orvix.auth.session'])`, and paste the \"token\" value (or the whole JSON object).",
    placeHolder: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
    password: true,
    ignoreFocusOut: true,
  });
  if (!raw) return false;
  const value = raw.trim();
  const session = parseGatewaySession(value);
  if (!session) {
    vscode.window.showErrorMessage("That does not look like a valid Orvix session token.");
    return false;
  }
  try {
    await provider.configureGatewaySession(session);
    output.appendLine("[auth] gateway session imported");
    vscode.window.showInformationMessage("Orvix usage session imported. Refreshing credits and usage…");
    return true;
  } catch (error) {
    output.appendLine(`[auth] gateway session import failed: ${messageOf(error)}`);
    vscode.window.showErrorMessage(`Could not import Orvix usage session: ${messageOf(error)}`);
    return false;
  }
}

async function removeGatewaySession(provider: OrvixProvider): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    "Remove the imported Orvix usage session from Secret Storage?",
    { modal: true },
    "Remove Usage Session",
  );
  if (choice !== "Remove Usage Session") return;
  await provider.clearGatewaySession();
  vscode.window.showInformationMessage("Orvix usage session removed.");
}

function parseGatewaySession(value: string): { token: string; refreshToken?: string } | undefined {
  // A plain token is enough; also accept a full session JSON object when pasted.
  const candidate = value.startsWith("{") ? value : JSON.stringify({ token: value });
  try {
    const parsed = JSON.parse(candidate) as { token?: unknown; refreshToken?: unknown };
    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    if (!token.startsWith("eyJ")) return undefined;
    const refreshToken = typeof parsed.refreshToken === "string" ? parsed.refreshToken.trim() : undefined;
    return refreshToken ? { token, refreshToken } : { token };
  } catch {
    return undefined;
  }
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

/**
 * Opens the Orvix usage and credits quick pick.
 *
 * The picker lists live credits, gateway summary, and locally tracked request
 * rows, followed by actions to refresh or open the platform pages. Refreshing
 * re-renders the picker so the new balances are visible immediately.
 *
 * @example
 * // Bound to the `orvixCopilot.showUsage` command and the status bar click.
 * await vscode.commands.executeCommand("orvixCopilot.showUsage");
 *
 * @see {@link formatUsageRows}, {@link toUsageQuickPickItem}
 */
async function showUsage(provider: OrvixProvider, output: vscode.OutputChannel, usageStatus?: vscode.StatusBarItem): Promise<void> {
  const rows = formatUsageRows(provider.getUsageSnapshot()).map(toUsageQuickPickItem);
  const actions: UsageQuickPickItem[] = [
    { label: "$(refresh) Refresh credits and usage", description: "Re-fetch from the Orvix gateway", action: "refresh" },
    { label: "$(account) Import usage session", description: "Paste the browser session to unlock credits", action: "session" },
    { label: "$(link-external) Open Orvix usage", description: "platform.orvix.id/usage", action: "openUsage" },
    { label: "$(link-external) Open Billing & Credits", description: "platform.orvix.id/billing", action: "openBilling" },
  ];
  const picked = await vscode.window.showQuickPick([...rows, ...actions], {
    title: "Orvix usage and credits",
    placeHolder: "Credits, requests, and spend",
  });
  if (!picked?.action) return;
  if (picked.action === "refresh") {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Refreshing Orvix credits and usage…" },
      () => provider.refreshUsage(),
    );
    usageStatus?.show();
    await showUsage(provider, output, usageStatus);
  } else if (picked.action === "session") {
    if (await configureGatewaySession(provider, output)) await showUsage(provider, output, usageStatus);
  } else if (picked.action === "openUsage") {
    await openUsage();
  } else if (picked.action === "openBilling") {
    const opened = await vscode.env.openExternal(vscode.Uri.parse(BILLING_URL));
    if (!opened) vscode.window.showWarningMessage("VS Code could not open Orvix billing.");
  }
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
