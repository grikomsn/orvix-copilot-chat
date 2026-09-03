import * as vscode from "vscode";
import { OrvixAuth } from "./auth/auth";
import { registerCommands } from "./commands/commands";
import { messageOf } from "./errors";
import { OrvixProvider } from "./provider";
import { extensionUserAgent } from "./transport/protocol";
import type { OrvixUsageSnapshot } from "./usage/domain";
import { renderUsageStatus } from "./usage/presentation";

const USAGE_STATE_KEY = "orvixCopilot.usageSnapshots.v1";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Orvix");
  const auth = new OrvixAuth(context.secrets);
  const initialUsage = context.globalState.get<OrvixUsageSnapshot>(USAGE_STATE_KEY) ?? {};
  const provider = new OrvixProvider(
    auth,
    output,
    extensionUserAgent(context.extension.packageJSON.version, vscode.version),
    context.globalState,
    initialUsage,
  );
  const usageStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  usageStatus.name = "Orvix credits and API activity";
  usageStatus.command = "orvixCopilot.showUsage";
  renderUsageStatus(usageStatus, provider.getUsageSnapshot());
  updateUsageStatusVisibility(usageStatus);

  context.subscriptions.push(
    output,
    usageStatus,
    provider.onDidChangeUsage((usage) => {
      renderUsageStatus(usageStatus, usage);
      updateUsageStatusVisibility(usageStatus);
      void context.globalState.update(USAGE_STATE_KEY, usage);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("orvixCopilot.reasoningEffort") ||
        event.affectsConfiguration("orvixCopilot.catalogCacheMinutes")
      ) {
        provider.fireDidChange();
      }
      if (event.affectsConfiguration("orvixCopilot.showUsageStatusBar")) {
        updateUsageStatusVisibility(usageStatus);
      }
    }),
    vscode.lm.registerLanguageModelChatProvider("orvix", provider),
    ...registerCommands(auth, provider, output, usageStatus),
  );

  output.appendLine(
    `[activate] Orvix for Copilot Chat ${context.extension.packageJSON.version} on VS Code ${vscode.version}`,
  );
  void auth.hasApiKey().then((configured) => {
    if (!configured) return;
    updateUsageStatusVisibility(usageStatus);
    void provider.refreshUsage().catch((error) => {
      output.appendLine(`[usage] initial refresh failed: ${messageOf(error)}`);
    });
    void provider.refreshModels().catch((error) => {
      output.appendLine(`[models] initial refresh failed: ${messageOf(error)}`);
    });
  });
}

function updateUsageStatusVisibility(item: vscode.StatusBarItem): void {
  if (vscode.workspace.getConfiguration("orvixCopilot").get("showUsageStatusBar", true)) item.show();
  else item.hide();
}
