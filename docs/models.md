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
families include `orvix/auto`, `orvix/atria-dawn-preview`, `orvix/jev`, the
`orvix/muse-spark-*` and `orvix/muse-wonder-*` reasoning models,
`orvix/deepseek-v4*`, `orvix/hy*`, `orvix/glm-*`, `orvix/gpt-5.6-*`,
`orvix/gpt-6-*`, `orvix/claude-haiku-5.5`, `orvix/claude-sonnet-5.5`,
`orvix/grok-4.7`, `orvix/gemini-*-flash`, `orvix/gemini-4-argon`,
`orvix/minimax-*`, `orvix/mimo-*`, `orvix/qwen-*`, and `orvix/kimi-*`, with
`:free` variants that appear and disappear over time (none currently listed).
Free routes inherit their paid id's managed metadata without
its per-token cost, and reasoning profiles resolve `:free` ids to their paid
id. See the [Orvix Platform](https://platform.orvix.id) for the
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

## Copilot SDK sessions

The **Copilot** session runtime uses a separate model-discovery path from
ordinary **Local** chat. Its BYOK bridge discovers effort options specifically
from `configurationSchema.properties.reasoningEffort`. Keep that property
separate from Context Window and other controls, with the model's supported
values and a default from that list.

In VS Code 1.141, the SDK picker further restricts efforts to `none`, `minimal`,
`low`, `medium`, `high`, `xhigh`, `max`, and `ultra`. Each model exposes only the
intersection with its own supported list. The extension continues translating
selected efforts to the provider's native request fields.

Orvix's supported model effort lists survive the SDK filter, including
`minimal` where a verified model profile accepts it. Routes without reasoning
controls retain no effort picker or request parameter. Use Local chat for the
extension's Context Window control; the SDK picker does not expose it.

After installing an extension update, restart VS Code or reload every open
window so the shared BYOK bridge receives fresh model metadata.

References: [VS Code BYOK discovery](https://github.com/microsoft/vscode/blob/2a59476c9bfcb90b3ddc372c36762471b7dfad1c/src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostByokLmHandler.ts),
[SDK Thinking Level filtering](https://github.com/microsoft/vscode/blob/2a59476c9bfcb90b3ddc372c36762471b7dfad1c/src/vs/platform/agentHost/node/copilot/copilotAgent.ts#L2757),
and [accepted agent-host effort tiers](https://github.com/microsoft/vscode/blob/2a59476c9bfcb90b3ddc372c36762471b7dfad1c/src/vs/platform/agentHost/common/reasoningEffort.ts).
