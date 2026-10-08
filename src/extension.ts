import * as vscode from "vscode";
import { registerInlineCompletions } from "./autocomplete";
import { OrvixAuth } from "./auth/auth";
import { registerCommands } from "./commands/commands";
import { OrvixImageGenerationTool, ORVIX_IMAGE_TOOL_NAME } from "./images/vscode-tool";
import { OrvixProvider } from "./provider";
import { extensionUserAgent } from "./transport/protocol";
import type { OrvixUsageSnapshot } from "./usage/domain";
import { renderUsageStatus } from "./usage/presentation";

/** GlobalState key holding the persisted usage snapshot. */
const USAGE_STATE_KEY = "orvixCopilot.entryUsage.v1";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Orvix");
  const auth = new OrvixAuth(context.secrets);
  // Restore only entry-scoped inference activity; billing balances stay in memory.
  const initialUsage = context.globalState.get<Record<string, OrvixUsageSnapshot>>(USAGE_STATE_KEY) ?? {};
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
  renderUsageStatus(usageStatus, provider.getSelectedUsageSnapshot());
  updateUsageStatusVisibility(usageStatus);

  context.subscriptions.push(
    output,
    usageStatus,
    provider.onDidChangeUsage((usage) => {
      renderUsageStatus(usageStatus, usage);
      updateUsageStatusVisibility(usageStatus);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("orvixCopilot.reasoningEffort") ||
        event.affectsConfiguration("orvixCopilot.catalogCacheMinutes") ||
        event.affectsConfiguration("orvixCopilot.managementEntry")
      ) {
        provider.fireDidChange();
      }
      if (event.affectsConfiguration("orvixCopilot.showUsageStatusBar")) {
        updateUsageStatusVisibility(usageStatus);
      }
    }),
    vscode.lm.registerLanguageModelChatProvider("orvix", provider),
    vscode.lm.registerTool(
      ORVIX_IMAGE_TOOL_NAME,
      new OrvixImageGenerationTool({
        resolveApiKey: async () => provider.getFeatureApiKey("imageEntry"),
        resolveDefaultModel: () =>
          vscode.workspace.getConfiguration("orvixCopilot").get<string>("defaultImageModel") ?? undefined,
        userAgent: extensionUserAgent(context.extension.packageJSON.version, vscode.version),
        output,
      }),
    ),
    ...registerCommands(provider, output, usageStatus),
    registerInlineCompletions(context, {
      resolveApiKey: async () => provider.getFeatureApiKey("inlineSuggestionsEntry"),
      output,
      version: context.extension.packageJSON.version as string,
      vscodeVersion: vscode.version,
    }),
  );

  output.appendLine(
    `[activate] Orvix for Copilot Chat ${context.extension.packageJSON.version} on VS Code ${vscode.version}`,
  );

}

/** Shows or hides the usage status bar based on the `showUsageStatusBar` setting. */
function updateUsageStatusVisibility(item: vscode.StatusBarItem): void {
  if (vscode.workspace.getConfiguration("orvixCopilot").get("showUsageStatusBar", true)) item.show();
  else item.hide();
}
