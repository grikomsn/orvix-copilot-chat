/** Status bar rendering for Orvix usage and credits. */

import * as vscode from "vscode";
import {
  formatUsageStatusBar,
  formatUsageTooltip,
  type OrvixUsageSnapshot,
  type UsageDisplayRow,
} from "./domain";

/** A quick-pick entry that maps back to a usage command action. */
export interface UsageQuickPickItem extends vscode.QuickPickItem {
  /** Action to run when the entry is picked; `undefined` for info-only rows. */
  action?: "openUsage" | "openBilling" | "refresh" | "session";
}

/**
 * Renders a usage snapshot into a status-bar item's text and tooltip.
 *
 * @example
 * const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
 * item.command = "orvixCopilot.showUsage";
 * renderUsageStatus(item, { credits: { availableMicrousd: 250000 } });
 * item.show();
 *
 * @see {@link formatUsageStatusBar}, {@link formatUsageTooltip}
 */
export function renderUsageStatus(item: vscode.StatusBarItem, snapshot: OrvixUsageSnapshot): void {
  item.text = formatUsageStatusBar(snapshot);
  item.tooltip = formatUsageTooltip(snapshot);
}

/**
 * Converts a display row into a quick-pick item, prefixing the label with the
 * icon matching the row kind.
 *
 * @example
 * toUsageQuickPickItem({
 *   kind: "credits",
 *   label: "Available credits: $0.25",
 *   description: "Orvix project credits",
 * });
 * // => { label: "$(credit-card) Available credits: $0.25", description: "Orvix project credits", alwaysShow: true }
 *
 * @see {@link UsageDisplayRow}, {@link formatUsageRows}
 */
export function toUsageQuickPickItem(row: UsageDisplayRow): UsageQuickPickItem {
  const icon = {
    credits: "$(credit-card)",
    spend: "$(graph)",
    request: "$(history)",
    requests: "$(request-changes)",
    tokens: "$(symbol-numeric)",
    warning: "$(warning)",
    empty: "$(circle-slash)",
  }[row.kind];
  return {
    label: `${icon} ${row.label}`,
    description: row.description,
    detail: row.detail,
    alwaysShow: true,
  };
}
