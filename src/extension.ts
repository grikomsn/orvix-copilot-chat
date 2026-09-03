import * as vscode from "vscode";
import { OrvixAuth } from "./auth/auth";
import { registerCommands } from "./commands/commands";
import { messageOf } from "./errors";
import { OrvixProvider } from "./provider";
import { extensionUserAgent } from "./transport/protocol";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Orvix");
  const auth = new OrvixAuth(context.secrets);
  const provider = new OrvixProvider(
    auth,
    output,
    extensionUserAgent(context.extension.packageJSON.version, vscode.version),
    context.globalState,
  );
  context.subscriptions.push(
    output,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("orvixCopilot.reasoningEffort") ||
        event.affectsConfiguration("orvixCopilot.catalogCacheMinutes")
      ) {
        provider.fireDidChange();
      }
    }),
    vscode.lm.registerLanguageModelChatProvider("orvix", provider),
    ...registerCommands(auth, provider, output),
  );

  output.appendLine(
    `[activate] Orvix for Copilot Chat ${context.extension.packageJSON.version} on VS Code ${vscode.version}`,
  );
  void auth.hasApiKey().then((configured) => {
    if (!configured) return;
    void provider.refreshModels().catch((error) => {
      output.appendLine(`[models] initial refresh failed: ${messageOf(error)}`);
    });
  });
}
