# Setup and usage

## Requirements

- Visual Studio Code 1.125 or newer
- GitHub Copilot Chat
- An Orvix project API key with the `ai:invoke` scope

## Connect Orvix

1. Create a key in the [Orvix Platform](https://platform.orvix.id/api-keys).
2. In Copilot Chat, open the model picker and choose **Manage Models**.
3. Add an **Orvix** provider entry and paste the complete `orv-sk_live_…` key.
4. Select a model returned for the key's project.

Provider-entry discovery uses `https://api.orvix.id/v1/models`. The live response is authoritative: additions and removals appear automatically after the catalog cache expires or **Orvix: Refresh Models** runs. A persisted catalog is used only when live discovery is unavailable.

## Funding modes

- `orvix/*` models are managed by Orvix and spend Orvix Credits.
- Unprefixed model IDs use upstream credentials configured under Orvix Providers.
- `orvix/auto` selects a managed model from the request shape; its cost varies with the selected model.

## Commands

| Command | Purpose |
| --- | --- |
| **Orvix: Manage Connection** | Open the connection workflow |
| **Orvix: Configure API Key** | Validate and store a legacy key in VS Code Secret Storage |
| **Orvix: Import Usage Session** | Paste a browser session token to unlock credits/usage on the gateway |
| **Orvix: Remove Usage Session** | Remove the imported gateway session |
| **Orvix: Refresh Models** | Refresh the live project model catalog |
| **Orvix: Test Inference** | Send a small non-streaming verification request |
| **Orvix: Open API Keys** | Open the Orvix API Keys page |
| **Orvix: Open Usage** | Open Orvix usage in the browser |
| **Orvix: Show Usage and Credits** | Show credits, requests, spend, and session tracking, with refresh and page links |
| **Orvix: Show Diagnostics** | Show endpoint, key state, and registered models |

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `orvixCopilot.reasoningEffort` | `high` | Default reasoning effort for models that support it |
| `orvixCopilot.maxOutputTokens` | `0` | Use the model maximum, or cap output explicitly |
| `orvixCopilot.requestTimeoutSeconds` | `600` | Total inference timeout |
| `orvixCopilot.streamIdleTimeoutSeconds` | `120` | Maximum silence during a response stream |
| `orvixCopilot.catalogCacheMinutes` | `5` | Live catalog refresh interval |
| `orvixCopilot.debugLogging` | `false` | Log metadata without prompts or credentials |
| `orvixCopilot.showUsageStatusBar` | `true` | Show Orvix credits and usage in the status bar |
| `orvixCopilot.inlineSuggestions` | `false` | Experimental ghost-text inline completions while typing |
| `orvixCopilot.inlineSuggestionsModel` | `orvix/deepseek-v4-pro` | Model used for inline completions at `reasoning_effort: none` |
| `orvixCopilot.inlineSuggestionsChatInput` | `false` | Also offer suggestions inside the Copilot Chat prompt box |
| `orvixCopilot.inlineSuggestionsDebounceMs` | `300` | Debounce between typing and a completion request |
| `orvixCopilot.inlineSuggestionsTimeoutMs` | `3000` | Per-request completion timeout |
| `orvixCopilot.inlineSuggestionsMaxTokens` | `128` | Tokens generated per suggestion |
| `orvixCopilot.inlineSuggestionsPrefixLines` | `10` | Document lines sent before the cursor |
| `orvixCopilot.inlineSuggestionsSuffixChars` | `300` | Document characters sent after the cursor |

**Orvix: Set Inline Suggestions Model** (also in the Manage menu) lists the models whose verified thinking profile includes `reasoning_effort: none`, ordered cheap-and-fast first with measured badges and warnings. A "Use a custom model id…" entry keeps any Orvix model id reachable (profiles without `none` will still think). The command only writes settings, so changes apply on the next keystroke without a reload.

Models with a supported reasoning capability expose a **Reasoning Effort** picker
in the Copilot model picker. The available values are verified per model against
the live Orvix API (Orvix forwards `reasoning_effort` to the upstream provider,
so values the upstream rejects surface as HTTP 502):

| Model | Reasoning Effort values |
| --- | --- |
| `orvix/muse-spark-1.2`, `orvix/muse-spark-1.3` | `minimal`, `low`, `medium`, `high`, `xhigh` |
| `orvix/deepseek-v4-pro` | `none`, `low`, `high`, `max` |
| `orvix/glm-5.2`, `orvix/gpt-5.6-sol`, `orvix/gpt-5.6-terra` | `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` |
| `orvix/gpt-5.6-luna` | `none`, `low`, `medium`, `high`, `xhigh`, `max` |

The per-request picker selection overrides `orvixCopilot.reasoningEffort`. The
default is `high`, and unsupported values fall back to the model's profile
default.

## Credits and usage

Inference uses the `orv-sk_live_` API key, which is inferencing-only. The Orvix
**gateway** (`gateway.orvix.id`) that serves credits, usage, and balance is
authenticated by a **user session** instead. To populate the credits/usage
status bar:

1. Sign in at <https://platform.orvix.id> and open your browser DevTools console.
2. Run `JSON.parse(localStorage['orvix.auth.session'])` and copy the `token` value.
3. Run **Orvix: Import Usage Session** (or **Orvix: Show Usage and Credits** → **Import usage session**) and paste it.

The token is stored in VS Code Secret Storage. It expires after about an hour,
so re-import when prompted. Without it, the extension still shows locally
tracked request/token totals for the current session from the inference stream.

With a session imported, **Orvix: Show Usage and Credits** also surfaces your
**IDR account balance** and **active plans** (the rupiah balance is separate
from the USD provider credits shown on `/billing`), plus your top-up history.

## Troubleshooting

- **401:** verify the complete key starts with `orv-sk_live_` and includes `ai:invoke`.
- **401 on Usage/Credits:** the gateway needs a browser session; run **Orvix: Import Usage Session**.
- **402:** add Orvix Credits for managed `orvix/*` models.
- **403:** the key is not allowed to use the selected funding source.
- **429:** the key's rate or monthly spend limit was reached.
- **No BYOK route:** configure that provider under [Orvix Providers](https://platform.orvix.id/providers), or select a managed `orvix/*` model.
- **Catalog temporarily unavailable:** the extension keeps the last complete per-key catalog and retries discovery later.

## Context window size

Each model entry exposes a Context Window control in the Copilot Chat model
picker (`src/models/options.ts`). The options are Auto (the default), fixed
64K, 128K, and 200K tiers that fit below the model's registered input limit,
and Maximum. Auto and Maximum keep the default behavior.

A specific tier acts as a local upper limit: the selection is stored per model
by VS Code, never exceeds the model's registered input limit, and when the
converted messages exceed the selected tier the oldest conversation turns are
trimmed before the request is built (`src/provider/history-trim.ts`). The
first message, the current turn, and tool-call/result adjacency are always
preserved, and models without a fitting tier keep their picker unchanged.
