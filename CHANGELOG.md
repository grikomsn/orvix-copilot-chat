# Changelog

## 0.6.0

### Minor Changes

- ecc25f2: Enrich model metadata with best-effort per-token pricing. Orvix does not disclose per-token rates on its model endpoint, so the extension now reports pricing from live API data when a provider advertises it, otherwise falling back to the upstream provider's published USD per-1M-token rates (sourced from models.dev) for managed `orvix/*` models. BYOK models without either source show no price rather than a guessed one. Pricing surfaces in the model picker, usage tooltip, and usage quick pick. Models.dev metadata now round-trips cost through the persisted cache, and unknown managed models no longer get a fabricated price.
- ecc25f2: Add an image-generation language-model tool (`orvixImages`, contributed as `orvix-copilot-chat_generateImage`) that calls the Orvix `POST /v1/images/generations` endpoint and spends prepaid Image Credits. It supports the image catalogue models (flux-2-pro, qwen-image-3.0, gpt-image-2, grok-imagine-image, seedream-5.0-pro, midjourney, gemini-3-pro-image), returns hosted image URLs plus the credits spent, and never inlines image bytes into the model context. Image Credits are now tracked separately from USD credits: with a gateway session imported, the status bar, tooltip, and usage quick pick show the remaining Image Credits summed from active `grantsImage` plans, and live per-model credit costs come from the gateway `models/catalogue` (with a bundled fallback table when no session is available).
- ecc25f2: Harden the `orvixImages` tool and add a configurable default image model. Space out pre-stream image retries with the shared backoff policy (honoring `Retry-After`), bound tool invocations to a 120-second timeout, and return actionable error guidance for rate limits and Orvix-side 502 outages. `model` is now optional in the tool schema: omitted or unknown models fall back to the new `orvixCopilot.defaultImageModel` setting (default `flux-2-pro`), configurable via the new **Orvix: Set Default Image Model** command and the Manage Connection menu, so a calling model's bad slug guess can no longer block generation.

## 0.5.0

### Minor Changes

- 20056dc: Adds a Context Window picker control (Auto, 64K, 128K, 200K, Maximum) that caps how much conversation history each request sends, clamped to the model's registered input limit.

### Patch Changes

- 20056dc: Fix Auto context size being interpreted as zero input tokens by VS Code, collapsing the context indicator to the output reserve and triggering premature compaction.

  Reserve up to 32K response tokens by default instead of subtracting the entire output capability from the context window. Honor positive live shared-context limits independently of output capability.

- 20056dc: Report each model's `maxInputTokens` as context minus the output budget so the picker's context window matches the model's real usable input and no longer collapses to the output cap.

## 0.4.0

### Minor Changes

- 8a3778b: Add experimental, opt-in inline code suggestions (ghost text) powered by the Orvix gateway with `reasoning_effort: "none"`. Enable with `orvixCopilot.inlineSuggestions` and choose the model (`inlineSuggestionsModel`, default `orvix/deepseek-v4-pro`; the only model live-measured to honor the switch with zero hidden reasoning). A new **Orvix: Set Inline Suggestions Model** command (also in the Manage menu) lists models whose verified thinking profile includes `none`, ordered cheap-and-fast first with measured badges and warnings; a custom model id remains enterable. Debounce, timeout, token budget, and context windows are configurable. The Copilot Chat prompt box is excluded unless separately enabled, and document context is never logged.

## 0.3.4

### Patch Changes

- e13add6: Improve display-name normalization for model IDs that are not yet in the managed catalog: future `orvix/*` entries drop the redundant vendor prefix and recurring families render with vendor casing (`GPT`, `GLM`, `MiMo`, `DeepSeek`, `MiniMax`, title-cased `Qwen`/`Kimi`).
- e13add6: Resync the managed model catalog with the live Orvix directory. Adds display names and enforced limits for `orvix/glm-5.2`, `orvix/gpt-5.6-sol`, `orvix/gpt-5.6-terra`, `orvix/grok-4.6`, and `orvix/qwen-3.8-flash`, and exposes verified Reasoning Effort pickers for the new reasoning-capable models (`orvix/glm-5.2`, `orvix/gpt-5.6-sol`, `orvix/gpt-5.6-terra`).

## 0.3.3

### Patch Changes

- 28066d0: Correct managed-model context and output limits, route-specific capabilities, available reasoning-effort controls, and picker names.

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
