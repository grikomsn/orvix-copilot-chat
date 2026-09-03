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
- API keys managed by VS Code Secret Storage or provider configuration
- Multiple isolated Orvix API-key entries in Manage Language Models
- Live `/models` discovery for both `orvix/*` managed models and unprefixed BYOK models
- Durable per-key catalog snapshots for offline startup
- Streaming text, reasoning output, token usage, images, and function-tool calls
- Agent mode function-tool calls with complete argument validation
- Bounded retries for pre-stream network and gateway failures only
- Orvix Credits and usage tracking with a status-bar balance and quick-pick details
- Import a browser session token to unlock gateway credits/usage (the API key is inferencing-only)
- Rupiah account balance, active plans, and top-up history surfaced in the usage quick pick

## Quick start

1. Install the extension. You need VS Code 1.125 or newer and GitHub Copilot Chat.
2. Create a project API key with the `ai:invoke` scope in the [Orvix Platform](https://platform.orvix.id/api-keys).
3. Open Copilot Chat, select **Manage Models**, add an **Orvix** provider entry, and enter the key.
4. Choose any model returned for that Orvix project.

Managed model IDs start with `orvix/` and spend Orvix Credits. Unprefixed IDs use provider credentials configured in Orvix and are billed by that upstream provider. `orvix/auto` lets Orvix route each request to a suitable managed model.

To use more than one project or key, add another **Orvix** entry. Each entry keeps its own credential and model list. The legacy **Orvix: Configure API Key** command remains available for command-driven workflows.

## Documentation

- [Setup, settings, and troubleshooting](docs/setup.md)
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
