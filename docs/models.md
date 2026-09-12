# Models

The extension discovers the models available to your Orvix project from
`https://api.orvix.id/v1/models`. Managed model IDs start with `orvix/` and
spend Orvix Credits; unprefixed IDs use provider credentials configured in
Orvix and are billed by that upstream provider. `orvix/auto` selects a managed
model from the request shape.

The live catalog is authoritative. A durable per-key catalog snapshot in VS Code
`globalState` keeps model selection functional during transient outages; stale
entries are never merged into a successful response.

## Managed models

Live discovery lists the `orvix/*` models enabled for your project. Documented
families include `orvix/auto`, the `orvix/muse-spark-*` reasoning models,
`orvix/deepseek-v4-pro`, `orvix/glm-*`, `orvix/gpt-5.6-*`, `orvix/grok-4.6`,
`orvix/gemini-*-flash`, `orvix/minimax-*`, `orvix/mimo-*`, `orvix/qwen-*`, and
`orvix/kimi-*`. See the [Orvix Platform](https://platform.orvix.id) for the
current list.

## BYOK models

Unprefixed model IDs use provider credentials you configure in the Orvix
Platform and are billed by the upstream provider directly. See the
[Orvix Platform](https://platform.orvix.id) for the current BYOK catalog.

## Reasoning efforts

Each model advertises its supported reasoning levels through its verified
thinking profile. The Copilot Chat model picker lists only the efforts a given
model accepts. The workspace default (`orvixCopilot.reasoningEffort`) applies
when the model supports it; otherwise the model's own default is used. A
per-request picker selection overrides the workspace default.

## Pricing

Per-model input, cached-input, and output pricing is surfaced in the model
picker. Live API pricing wins when the provider returns it; otherwise managed
`orvix/*` models fall back to the upstream provider's published rates
(estimates, sourced from [models.dev](https://models.dev)). BYOK models without
either source show no price. The [Orvix Platform](https://platform.orvix.id)
dashboard is authoritative for credit balances and billing.
