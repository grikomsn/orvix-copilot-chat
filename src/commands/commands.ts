/** User-facing Orvix commands and connection workflows. */

import * as vscode from "vscode";
import { CONFIG_SECTION, DEFAULT_INLINE_MODEL, INLINE_SUGGESTIONS_MODEL_SETTING } from "../autocomplete/config";
import { inlineModelChoices } from "../autocomplete/models";
import { messageOf } from "../errors";
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODEL_CREDIT_COSTS,
} from "../images/client";
import { API_BASE, OrvixProvider } from "../provider";
import { formatUsageRows } from "../usage/domain";
import { toUsageQuickPickItem, type UsageQuickPickItem } from "../usage/presentation";

const API_KEYS_URL = "https://platform.orvix.id/api-keys";
const USAGE_URL = "https://platform.orvix.id/usage";
const BILLING_URL = "https://platform.orvix.id/billing";

/** Settings key holding the user's default image model. */
export const DEFAULT_IMAGE_MODEL_SETTING = "defaultImageModel";

/** Short per-model notes shown in the default-image-model picker. */
const IMAGE_MODEL_NOTES: Readonly<Record<string, string>> = {
  "flux-2-pro": "Black Forest Labs",
  "qwen-image-3.0": "Qwen · low soft rate limit",
  "gpt-image-2": "OpenAI",
  "grok-imagine-image": "Grok Imagine",
  "seedream-5.0-pro": "ByteDance · always one image",
  "midjourney": "One 4-image grid",
  "gemini-3-pro-image": "Google",
};

export function registerCommands(
  provider: OrvixProvider,
  output: vscode.OutputChannel,
  usageStatus?: vscode.StatusBarItem,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("orvixCopilot.manage", () => manage(provider, output, usageStatus)),
    vscode.commands.registerCommand("orvixCopilot.selectEntry", () => selectEntry(provider, "managementEntry")),
    vscode.commands.registerCommand("orvixCopilot.selectInlineEntry", () => selectEntry(provider, "inlineSuggestionsEntry")),
    vscode.commands.registerCommand("orvixCopilot.selectImageEntry", () => selectEntry(provider, "imageEntry")),
    vscode.commands.registerCommand("orvixCopilot.forgetEntry", () => forgetEntry(provider)),
    vscode.commands.registerCommand("orvixCopilot.restoreEntry", () => restoreEntry(provider)),
    vscode.commands.registerCommand("orvixCopilot.configureGatewaySession", () => configureGatewaySession(provider, output)),
    vscode.commands.registerCommand("orvixCopilot.removeGatewaySession", () => removeGatewaySession(provider)),
    vscode.commands.registerCommand("orvixCopilot.refreshModels", () => refreshModels(provider)),
    vscode.commands.registerCommand("orvixCopilot.setInlineSuggestionsModel", () => setInlineSuggestionsModel()),
    vscode.commands.registerCommand("orvixCopilot.openUsage", () => openUsage()),
    vscode.commands.registerCommand("orvixCopilot.showUsage", () => showUsage(provider, output, usageStatus)),
    vscode.commands.registerCommand("orvixCopilot.setDefaultImageModel", () => setDefaultImageModel(output)),
    vscode.commands.registerCommand("orvixCopilot.testConnection", () => testConnection(provider, output)),
    vscode.commands.registerCommand("orvixCopilot.openApiKeys", () => openApiKeys()),
    vscode.commands.registerCommand("orvixCopilot.diagnostics", () => diagnostics(provider, output)),
  ];
}

async function manage(
  provider: OrvixProvider,
  output: vscode.OutputChannel,
  usageStatus?: vscode.StatusBarItem,
): Promise<void> {
  const choices = [
    { label: "$(settings-gear) Manage Language Models", action: "models" },
    { label: "$(account) Select management entry", action: "entry" },
    { label: "$(zap) Select inline suggestions entry", action: "inlineEntry" },
    { label: "$(device-camera) Select image generation entry", action: "imageEntry" },
    { label: "$(check) Test selected entry inference", action: "test" },
    { label: "$(refresh) Refresh selected entry models", action: "refresh" },
    { label: "$(zap) Set inline suggestions model", action: "inlineModel" },
    { label: "$(device-camera) Set default image model", action: "imageModel" },
    { label: "$(credit-card) Show selected entry usage and credits", action: "usage" },
    { label: "$(account) Bind billing session to selected entry", action: "session" },
    { label: "$(trash) Remove selected entry billing session", action: "removeSession" },
    { label: "$(trash) Forget entry before removing it", action: "forget" },
    { label: "$(history) Restore forgotten native entry", action: "restore" },
    { label: "$(link-external) Open Orvix API keys", action: "open" },
    { label: "$(output) Show Orvix logs", action: "logs" },
    { label: "$(info) Show diagnostics", action: "diagnostics" },
  ];
  const picked = await vscode.window.showQuickPick(choices, { title: "Orvix — Manage native entries" });
  if (!picked) return;
  if (picked.action === "models") await vscode.commands.executeCommand("workbench.action.chat.manageLanguageModels");
  else if (picked.action === "entry") await selectEntry(provider, "managementEntry");
  else if (picked.action === "inlineEntry") await selectEntry(provider, "inlineSuggestionsEntry");
  else if (picked.action === "imageEntry") await selectEntry(provider, "imageEntry");
  else if (picked.action === "forget") await forgetEntry(provider);
  else if (picked.action === "restore") await restoreEntry(provider);
  else if (picked.action === "removeSession") await removeGatewaySession(provider);
  else if (picked.action === "refresh") await refreshModels(provider);
  else if (picked.action === "inlineModel") await setInlineSuggestionsModel();
  else if (picked.action === "imageModel") await setDefaultImageModel(output);
  else if (picked.action === "test") await testConnection(provider, output);
  else if (picked.action === "usage") await showUsage(provider, output, usageStatus);
  else if (picked.action === "session") await configureGatewaySession(provider, output);
  else if (picked.action === "open") await openApiKeys();
  else if (picked.action === "logs") output.show(true);
  else if (picked.action === "diagnostics") await diagnostics(provider, output);
}

async function selectEntry(provider: OrvixProvider, setting: string): Promise<void> {
  const picked = await vscode.window.showQuickPick(provider.getEntries().map(({ entryId }) => ({ label: entryId })), {
    title: "Orvix — Select native entry", placeHolder: "Add entries with unique entryId values in Manage Language Models",
  });
  if (!picked) return;
  await vscode.workspace.getConfiguration(CONFIG_SECTION).update(setting, picked.label, vscode.ConfigurationTarget.Global);
  provider.fireDidChange();
}

async function forgetEntry(provider: OrvixProvider): Promise<void> {
  const ids = new Set([...provider.getEntries().map(({ entryId }) => entryId), ...Object.keys(provider.getObservedEntries())]);
  const picked = await vscode.window.showQuickPick([...ids].map((label) => ({ label })), {
    title: "Orvix — Forget entry", placeHolder: "Retire cached credentials and billing before removing the native entry",
  });
  if (!picked) return;
  await provider.forgetEntry(picked.label);
  await vscode.commands.executeCommand("workbench.action.chat.manageLanguageModels");
}

async function restoreEntry(provider: OrvixProvider): Promise<void> {
  const picked = await vscode.window.showQuickPick(provider.getForgottenEntries().map((label) => ({ label })), {
    title: "Orvix — Restore native entry", placeHolder: "Allow VS Code to provision this ID again; its billing session must be re-imported",
  });
  if (!picked) return;
  await provider.restoreEntry(picked.label);
  await vscode.commands.executeCommand("workbench.action.chat.manageLanguageModels");
}

async function configureGatewaySession(provider: OrvixProvider, output: vscode.OutputChannel): Promise<boolean> {
  const entry = provider.selectedEntry();
  // Extract the session object JSON from the platform page. It looks like
  // {"token":"...","refreshToken":"...","user":{...}}.
  const raw = await vscode.window.showInputBox({
    title: `Bind Orvix billing session to ${entry.entryId}`,
    prompt:
      `Confirm this browser account owns entry ${entry.entryId}. Open platform.orvix.id, run JSON.parse(localStorage['orvix.auth.session']), and paste the \"token\" value (or the whole JSON object).`,
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
    await provider.configureGatewaySession(session, entry);
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

interface InlineModelPickItem extends vscode.QuickPickItem {
  readonly action?: string | "custom";
}

async function setInlineSuggestionsModel(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const current = configuration.get<string>(INLINE_SUGGESTIONS_MODEL_SETTING, DEFAULT_INLINE_MODEL) ?? DEFAULT_INLINE_MODEL;
  const picked = await vscode.window.showQuickPick<InlineModelPickItem>([
    ...inlineModelChoices(current).map((choice) => ({
      label: choice.label,
      description: choice.description,
      detail: choice.detail,
      action: choice.id,
    })),
    { label: "", kind: vscode.QuickPickItemKind.Separator },
    { label: "$(pencil) Use a custom model id…", detail: "Enter any Orvix model id; profiles without reasoning_effort none will still think.", action: "custom" as const },
  ], {
    title: "Orvix — Set Inline Suggestions Model",
    placeHolder: `Current: ${current}`,
  });
  if (!picked?.action) return;
  if (picked.action === "custom") {
    const value = await vscode.window.showInputBox({
      title: "Custom inline suggestions model id",
      value: current,
      prompt: "Any Orvix model id; the vetted list is a starting point, not a restriction.",
    });
    if (value === undefined || !value.trim()) return;
    await configuration.update(INLINE_SUGGESTIONS_MODEL_SETTING, value.trim(), vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(`Orvix inline suggestions model set to ${value.trim()}.`);
    return;
  }
  await configuration.update(INLINE_SUGGESTIONS_MODEL_SETTING, picked.action, vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage(`Orvix inline suggestions model set to ${picked.action}. Applies on the next keystroke.`);
}

/** Quick-pick entry for the default image model picker. */
interface ImageModelPickItem extends vscode.QuickPickItem {
  readonly model?: string;
}

/**
 * Opens the default image model picker for the `orvixImages` tool.
 *
 * The selection is stored under `orvixCopilot.defaultImageModel` and used
 * whenever the calling model omits `model` from a tool call, so users can
 * pin a preferred (or cheaper) image model instead of relying on the calling
 * model to choose.
 */
export async function setDefaultImageModel(output?: vscode.OutputChannel): Promise<void> {
  const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const current = configuration.get<string>(DEFAULT_IMAGE_MODEL_SETTING) ?? DEFAULT_IMAGE_MODEL;
  const items: ImageModelPickItem[] = Object.entries(IMAGE_MODEL_CREDIT_COSTS).map(([model, credits]) => ({
    label: `$(${model === current ? "check" : "device-camera"}) ${model}`,
    description: `${credits} Image ${credits === 1 ? "Credit" : "Credits"} per image`,
    detail: IMAGE_MODEL_NOTES[model],
    ...(model === current ? { picked: true } : {}),
    model,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    title: "Orvix — Set Default Image Model",
    placeHolder: `Current: ${current} — used when a chat request omits the model`,
  });
  if (!picked?.model) return;
  await configuration.update(DEFAULT_IMAGE_MODEL_SETTING, picked.model, vscode.ConfigurationTarget.Global);
  output?.appendLine(`[images] default image model set to ${picked.model}`);
  void vscode.window.showInformationMessage(`Orvix default image model set to ${picked.model}.`);
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
    output.appendLine(`[test] model=${result.model} completed`);
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
    title: `Orvix usage and credits — ${provider.selectedEntry().entryId}`,
    placeHolder: "Credits, requests, and spend",
  });
  if (!picked?.action) return;
  if (picked.action === "refresh") {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Refreshing Orvix credits and usage…" },
      () => provider.refreshUsage(true),
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

async function diagnostics(provider: OrvixProvider, output: vscode.OutputChannel): Promise<void> {
  const models = await vscode.lm.selectChatModels({ vendor: "orvix" });
  const lines = [
    "# Orvix for Copilot Chat diagnostics",
    "",
    `- VS Code: ${vscode.version}`,
    `- API endpoint: ${API_BASE}`,
    `- Native entries available: ${provider.getEntries().length}`,
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
