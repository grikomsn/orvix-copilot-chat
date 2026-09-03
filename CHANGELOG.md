# Changelog

## 0.2.1

### Patch Changes

- 4abaf73: Refactor the reasoning-effort request gating into a vscode-free helper (`src/provider/effort.ts`) so it can be covered by the colocated `node` test runner. No behavior change.

## 0.2.0

### Minor Changes

- 584481b: Add a reasoning-effort toggle for Orvix models that support it. Reasoning-capable models now expose a **Reasoning Effort** picker in the Copilot model picker, with values verified per model against the live Orvix API (e.g. `orvix/glm-5.3-flash` exposes `low`/`high`, `orvix/gpt-5.6-luna` exposes `low`/`medium`/`high`/`max`, and most other reasoning models expose `minimal`/`low`/`medium`/`high`/`max`). A new `orvixCopilot.reasoningEffort` setting (default `high`) controls the default, per-request picker selections override it, and unsupported values fall back to the model's profile default. The effort is surfaced in diagnostics and the test-inference command.

## 0.1.2

### Patch Changes

- 1574133: Align the extension icon and repository cover with the sibling provider convention: Orvix and GitHub Copilot marks side by side on black.

## 0.1.1

### Patch Changes

- 0ea5e27: Use Orvix's managed-model capability catalogue, keep unknown models conservative, group models by native family, and retry documented pre-stream rate limits.

## 0.1.0

### Minor Changes

- 9a7e742: Launch the Orvix provider for GitHub Copilot Chat with managed and BYOK model discovery, streaming responses, image input, agent tools, and secure multi-key configuration.
