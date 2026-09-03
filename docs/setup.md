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
| **Orvix: Refresh Models** | Refresh the live project model catalog |
| **Orvix: Test Inference** | Send a small non-streaming verification request |
| **Orvix: Open API Keys** | Open the Orvix API Keys page |
| **Orvix: Open Usage** | Open Orvix usage in the browser |
| **Orvix: Show Diagnostics** | Show endpoint, key state, and registered models |

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `orvixCopilot.maxOutputTokens` | `0` | Use the model maximum, or cap output explicitly |
| `orvixCopilot.requestTimeoutSeconds` | `600` | Total inference timeout |
| `orvixCopilot.streamIdleTimeoutSeconds` | `120` | Maximum silence during a response stream |
| `orvixCopilot.catalogCacheMinutes` | `5` | Live catalog refresh interval |
| `orvixCopilot.debugLogging` | `false` | Log metadata without prompts or credentials |

## Troubleshooting

- **401:** verify the complete key starts with `orv-sk_live_` and includes `ai:invoke`.
- **402:** add Orvix Credits for managed `orvix/*` models.
- **403:** the key is not allowed to use the selected funding source.
- **429:** the key's rate or monthly spend limit was reached.
- **No BYOK route:** configure that provider under [Orvix Providers](https://platform.orvix.id/providers), or select a managed `orvix/*` model.
- **Catalog temporarily unavailable:** the extension keeps the last complete per-key catalog and retries discovery later.
