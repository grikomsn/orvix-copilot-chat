/** Status bar rendering for Orvix usage and credits. */

import * as vscode from "vscode";
import {
  formatUsageStatusBar,
  formatUsageTooltip,
  type OrvixUsageSnapshot,
  type UsageDisplayRow,
} from "./domain";

export interface UsageQuickPickItem extends vscode.QuickPickItem {
  action?: "openUsage" | "openBilling" | "refresh";
}

export function renderUsageStatus(item: vscode.StatusBarItem, snapshot: OrvixUsageSnapshot): void {
  item.text = formatUsageStatusBar(snapshot);
  item.tooltip = formatUsageTooltip(snapshot);
}

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
