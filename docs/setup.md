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

## Model pricing

Orvix does not disclose per-token rates on its model endpoint, so the extension reports **best-effort** pricing where available:

- Live API pricing wins when the provider returns it (e.g. a BYOK model that advertises `pricing`).
- Otherwise, for managed `orvix/*` models, the extension falls back to the upstream provider's published USD per-1M-token rates (sourced from [models.dev](https://models.dev)), which are **estimates, not Orvix billing**.
- BYOK models without either source show no price rather than a guessed one.

Pricing is surfaced in the model picker (`In: $… · Out: $… /1M tokens`), the usage tooltip, and the usage quick pick.

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
| **Orvix: Set Default Image Model** | Pick the image model used when the `orvixImages` tool is called without one |
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
| `orvixCopilot.defaultImageModel` | `flux-2-pro` | Image model used by the `orvixImages` tool when the caller omits one |
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

## Image generation

Orvix exposes a separate image-generation surface at
`POST /v1/images/generations`, which spends **prepaid Image Credits** — never
Ember tokens, wallet IDR, or Coding plan units. The extension exposes it as a
Copilot Chat **language-model tool** named `orvixImages` (contributed as
`orvix-copilot-chat_generateImage`).

To use it, enable or reference `orvixImages` in agent mode (the same way you'd
use a web-search tool). The tool takes a non-empty `prompt` and an optional
`model` (an Orvix image model slug, with or without the `orvix/` prefix), plus
optional `n`, `size`, `quality`, and `response_format`. When `model` is
omitted — or names an unknown model — the **default image model** is used
instead. The tool returns the hosted image URLs and the credits spent, and
inlines every generated image into the chat thread so they render directly in
the response. Vision-capable chat models also receive the image bytes on later
turns (letting them iterate on their own output); non-vision models see a
placeholder instead, and the URLs remain available as text either way.

### Default image model

Run **Orvix: Set Default Image Model** (also in **Orvix: Manage Connection**)
to pin the model used when a chat request omits one. The choice is stored in
the `orvixCopilot.defaultImageModel` setting (`flux-2-pro` by default) and
applies immediately to new tool calls. Pinning a default avoids failed
generations when the calling model guesses an unavailable slug, and makes a
cheaper model the path of least resistance.

Image model catalogue (per-image credit cost):

| Model | Credits |
| --- | --- |
| `flux-2-pro` | 7 |
| `qwen-image-3.0` | 8 |
| `gpt-image-2` | 11 |
| `grok-imagine-image` | 12 |
| `seedream-5.0-pro` | 19 |
| `midjourney` | 22 (one 4-image grid; `n` is forced to 1) |
| `gemini-3-pro-image` | 61 |

`seedream-5.0-pro` always returns a single image, and `midjourney` always
returns one grid. The remaining models accept `n` from 1 to 4 (default 1).

Image Credits are tracked separately from USD credits. With a gateway session
imported, **Orvix: Show Usage and Credits** shows your remaining Image Credits
(the sum of remaining units across active `grantsImage` plans) in the status
bar, tooltip, and usage quick pick. Live per-model credit costs come from the
gateway `models/catalogue`; when no session is available the extension falls
back to the bundled table above.

## Troubleshooting

- **401:** verify the complete key starts with `orv-sk_live_` and includes `ai:invoke`.
- **401 on Usage/Credits:** the gateway needs a browser session; run **Orvix: Import Usage Session**.
- **402:** add Orvix Credits for managed `orvix/*` models, or buy Image Credits for image generation.
- **403:** the key is not allowed to use the selected funding source.
- **429:** the key's rate or monthly spend limit was reached (some image models, e.g. `qwen-image-3.0`, publish a low soft RPM).
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

### Context indicator compatibility

Auto uses the model's registered input budget. The context indicator shows that
input budget plus the response reserve; a numeric context tier replaces only
the input budget. Auto is stored as `"auto"`, because VS Code interprets numeric
zero as a zero-token input window. If an existing chat still shows only the
output limit after upgrading, select Auto again in its Context Window control
to replace a saved zero selection.

The response reserve is distinct from the model's maximum output capability.
Input plus the reserved output equals the shared context window; live positive
context metadata remains authoritative even when output capability equals it.

Context Window uses the dedicated tokens group so it remains visible beside
reasoning controls. VS Code renders only one enum property per group.
