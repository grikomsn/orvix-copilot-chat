/**
 * Vetted inline-completion model candidates for the Orvix gateway, ordered
 * cheap-and-fast first.
 *
 * The compatible set is derived from the verified thinking profiles in
 * `models/options.ts` (profiles containing the "none" value), so newly
 * verified models appear automatically. Badges carry the live-measured
 * (2026-09-06) results; the QuickPick command writes the selected id to
 * `orvixCopilot.inlineSuggestionsModel`, so choices need no reload. Unknown
 * model ids stay reachable through the command's custom entry and the raw
 * setting.
 *
 * Pure and unit-tested.
 */

import { inlineCompatibleModelIds } from "../models/options";

export interface InlineModelCandidate {
  readonly id: string;
  /** Short measured/compatibility badge, e.g. "★ recommended · measured 2.2s TTFB". */
  readonly badge: string;
  /** One-line rationale shown under the model id. */
  readonly detail: string;
}

/** Measured notes keyed by model id; unlisted compatible models render as unmeasured. */
const MEASURED: Readonly<Record<string, { badge: string; detail: string }>> = {
  "orvix/deepseek-v4-pro": {
    badge: "★ recommended · measured 2.2s TTFB",
    detail: "Only model measured to honor reasoning_effort none with zero hidden reasoning, and DeepSeek pricing is the cheapest compatible tier.",
  },
  "orvix/glm-5.2": {
    badge: "⚠ measured: ignores none",
    detail: "Burned 500+ hidden reasoning characters despite reasoning_effort none; not recommended.",
  },
};

/** Stable tie-break order so unmeasured compatible models sort predictably. */
const UNMEASURED_ORDER = ["orvix/gpt-5.6-luna", "orvix/gpt-5.6-sol", "orvix/gpt-5.6-terra"];

export function inlineModelCandidates(): readonly InlineModelCandidate[] {
  const measuredFirst = "orvix/deepseek-v4-pro";
  const compatible = inlineCompatibleModelIds();
  const unmeasured = compatible
    .filter((id) => id !== measuredFirst && !MEASURED[id])
    .sort((left, right) => {
      const leftRank = UNMEASURED_ORDER.indexOf(left);
      const rightRank = UNMEASURED_ORDER.indexOf(right);
      return (leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank) - (rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank)
        || left.localeCompare(right);
    });
  const warnings = compatible.filter((id) => MEASURED[id]?.badge.startsWith("⚠")).sort();
  return [
    {
      id: measuredFirst,
      badge: MEASURED[measuredFirst].badge,
      detail: MEASURED[measuredFirst].detail,
    },
    ...unmeasured.map((id) => ({
      id,
      badge: "compatible · unmeasured",
      detail: "Verified thinking profile includes reasoning_effort none; measure the speed yourself.",
    })),
    ...warnings.map((id) => ({
      id,
      badge: MEASURED[id].badge,
      detail: MEASURED[id].detail,
    })),
  ];
}

export interface InlineModelChoice {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly detail: string;
}

/** Build QuickPick-shaped choices, pinning an unlisted current id to the top. */
export function inlineModelChoices(currentId: string): InlineModelChoice[] {
  const candidates = inlineModelCandidates();
  const listed = candidates.map((candidate) => ({
    id: candidate.id,
    label: candidate.id === currentId ? `$(check) ${candidate.id}` : candidate.id,
    description: candidate.badge,
    detail: candidate.detail,
  }));
  const pinned = !candidates.some((candidate) => candidate.id === currentId)
    ? [{
      id: currentId,
      label: `$(check) ${currentId}`,
      description: "current value",
      detail: "Kept from your settings; not in the vetted list.",
    }]
    : [];
  return [...pinned, ...listed];
}
