# Changelog

## 0.3.2

### Patch Changes

- ba66922: Fix the reasoning effort picker not appearing in the Copilot model picker. The reasoning schema was spread directly onto the model info object instead of nested under `configurationSchema`, so VS Code never rendered the toggle. Reasoning-capable Orvix models now expose their per-model Reasoning Effort values.

## 0.3.1

### Patch Changes

- c6a7198: Fix credits/usage tracking on the Orvix gateway. The gateway is authenticated by a user session (the API key is inferencing-only), so add an **Orvix: Import Usage Session** command to paste the browser session token, stored in Secret Storage, and use it for billing and usage. When no session is present, the usage view degrades gracefully: it shows locally tracked request/token totals from the inference stream, hints at the **Import usage session** fix, and explains the browser sign-in requirement instead of a raw 401. Refreshing explicitly from the usage quick pick offers to import a session. Also surface the IDR account balance, active plans, and top-up history from `/balance` and `/balance/topups`.

## 0.3.0

### Minor Changes

- 38087e7: Add Orvix Credits and usage tracking: a status-bar balance (`Show Usage and Credits`), a quick-pick overview with refresh plus links to the Orvix usage and billing pages, 7-day usage summary, credit transactions, and per-request token tracking persisted across sessions.

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
