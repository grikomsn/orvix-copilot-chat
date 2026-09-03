# Security model

Command-managed Orvix API keys are stored in VS Code `SecretStorage`; provider-entry keys are supplied through VS Code's secret provider configuration. They are not written to workspace settings, files, extension logs, or this repository. Keys must use Orvix's documented `orv-sk_live_` format and are validated against the project model-list endpoint before being stored by the command workflow.

Use a dedicated project key with only the `ai:invoke` scope. Orvix keys can carry a per-key rate limit and monthly spend limit; set those controls in the Orvix Platform and rotate or revoke the key there when it is no longer needed.

## Network access

The extension contacts:

- `https://api.orvix.id/v1/models` for project-scoped model discovery and validation
- `https://api.orvix.id/v1/chat/completions` for inference
- `https://models.dev/api.json` for best-effort capability metadata only

The live Orvix catalog remains authoritative. Prompt and tool content is sent only to Orvix for inference. The extension never sends the Orvix API key, prompts, or responses to models.dev.

## Logging

Debug logs contain model IDs, request state, retries, usage counters, and error summaries. They exclude API keys, authorization headers, prompts, tool arguments, and response text. Credential references are short one-way hashes used only to isolate in-memory and persisted model catalogs.
