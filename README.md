<p align="center">
  <img src="https://raw.githubusercontent.com/grikomsn/orvix-copilot-chat/main/assets/cover.jpg" alt="Orvix and GitHub Copilot" width="960">
</p>

<h1 align="center">Orvix for GitHub Copilot Chat</h1>

<p align="center">Use Orvix managed and BYOK models directly from the GitHub Copilot Chat model picker in Visual Studio Code.</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=grikomsn.orvix-copilot-chat"><img src="https://img.shields.io/visual-studio-marketplace/v/grikomsn.orvix-copilot-chat?style=flat-square&logo=visualstudiocode&label=Marketplace" alt="Visual Studio Marketplace version"></a>
  <a href="https://github.com/grikomsn/orvix-copilot-chat/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/grikomsn/orvix-copilot-chat/ci.yml?branch=main&style=flat-square&label=CI" alt="CI status"></a>
  <a href="https://github.com/grikomsn/orvix-copilot-chat/blob/main/LICENSE"><img src="https://img.shields.io/github/license/grikomsn/orvix-copilot-chat?style=flat-square" alt="MIT license"></a>
</p>

This extension is a native VS Code `LanguageModelChatProvider`. It validates a project-scoped Orvix API key, discovers the models available to that project, and streams OpenAI-compatible chat completions directly from `https://api.orvix.id/v1` into Copilot Chat.

## Highlights

- Direct Orvix integration without a local proxy
- API keys owned by VS Code native provider configuration
- Multiple isolated Orvix entries with stable explicit IDs in Manage Language Models
- Live `/models` discovery for both `orvix/*` managed models and unprefixed BYOK models
- Durable per-key catalog snapshots for offline startup
- Streaming text, reasoning output, token usage, images, and function-tool calls
- Agent mode function-tool calls with complete argument validation
- Bounded retries for pre-stream network and gateway failures only
- Orvix Credits and usage tracking with a status-bar balance and quick-pick details
- Explicitly bind a browser billing session to a selected entry (API keys are inferencing-only)
- Rupiah account balance, active plans, and top-up history surfaced in the usage quick pick
- Best-effort per-token pricing in the model picker, sourced from live API data or upstream provider rates
- Image generation tool (`orvixImages`) using prepaid Image Credits, tracked separately from USD credits

## Quick start

1. Install the extension. You need VS Code 1.125 or newer and GitHub Copilot Chat.
2. Create a project API key with the `ai:invoke` scope in the [Orvix Platform](https://platform.orvix.id/api-keys).
3. Open Copilot Chat, select **Manage Models**, add an **Orvix** provider entry, and enter a unique lowercase **Entry ID** plus the key.
4. Choose any model returned for that Orvix project.

Managed model IDs start with `orvix/` and spend Orvix Credits. Unprefixed IDs use provider credentials configured in Orvix and are billed by that upstream provider. `orvix/auto` lets Orvix route each request to a suitable managed model.

To use more than one project or key, add another **Orvix** entry with a different Entry ID. Keep that ID when rotating its key; saved model selections stay stable and old request handles are retired. Use **Orvix: Manage Connection** to select entries independently for management, inline suggestions, and image generation. Before deleting an entry, run **Orvix: Forget Native Entry** and remove it in Manage Language Models.

This major release uses native entries exclusively. Recreate command-managed keys as native entries, select their IDs explicitly, and re-import any billing session for its owning entry. Old keys and unbound sessions are never read or migrated.

## Documentation

- [Setup, settings, and troubleshooting](docs/setup.md)
- [Models and pricing](docs/models.md)
- [API key and security model](docs/security.md)
- [Development and releases](docs/development.md)

## Related projects

- [CrofAI for GitHub Copilot Chat](https://github.com/grikomsn/crof-copilot-chat)
- [Grok for GitHub Copilot Chat](https://github.com/grikomsn/grok-copilot-chat)
- [Codex Bridge for Copilot Chat](https://github.com/grikomsn/openai-oauth-copilot-chat)
- [Ollama Cloud for GitHub Copilot Chat](https://github.com/grikomsn/ollama-cloud-copilot-chat)
- [OpenCode for GitHub Copilot Chat](https://github.com/grikomsn/opencode-copilot-chat)
- [Poolside for GitHub Copilot Chat](https://github.com/grikomsn/poolside-copilot-chat)

Unofficial project; not affiliated with Orvix, GitHub, or Microsoft. Orvix and upstream-provider usage limits and charges still apply. Licensed under [MIT](LICENSE).

Forgotten entry IDs remain blocked across restarts, so native model discovery cannot automatically revive them. Use **Orvix: Restore Native Entry** to intentionally provision that ID again, then re-import its billing session. This stores only the forgotten IDs, never keys or account information.
