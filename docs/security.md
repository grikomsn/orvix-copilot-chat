# Security model

Orvix API keys are owned by VS Code's native secret provider configuration. The extension keeps provisioned keys only in memory and never reads command-managed keys or unbound legacy billing sessions. Keys are not copied into settings, files, extension logs, or this repository.

Each entry requires a unique explicit `entryId`. Selection IDs are stable while catalog and inference usage scopes include a one-way credential fingerprint. A distinct in-memory generation retires stale handles on rotation, rotating back, or forgetting an entry. Native group labels are never used as credential identities.

Browser billing sessions remain in `SecretStorage`. The user explicitly binds each session to the selected entry and its current credential; no label or fingerprint proves account ownership. Rotation and forgetting remove that binding. Late billing responses cannot overwrite a replaced entry or a newer session binding. Account balances, project metadata, and billing transactions are not persisted in the observation journal or activity cache. The journal contains only entry IDs, model counts, and timestamps.

VS Code does not expose native entry removal to the provider. Use **Orvix: Forget Native Entry** before deleting the entry in Manage Language Models. This retires cached keys, model handles, activity, and billing sessions; it does not revoke the remote API key.

Use a dedicated project key with only the `ai:invoke` scope. Orvix keys can carry a per-key rate limit and monthly spend limit; set those controls in the Orvix Platform and rotate or revoke the key there when it is no longer needed.

## Network access

The extension contacts:

- `https://api.orvix.id/v1/models` for project-scoped model discovery and validation
- `https://api.orvix.id/v1/chat/completions` for inference
- `https://models.dev/api.json` for best-effort capability metadata only

The live Orvix catalog remains authoritative. Prompt and tool content is sent only to Orvix for inference. The extension never sends the Orvix API key, prompts, or responses to models.dev.

## Inline completions

When `orvixCopilot.inlineSuggestions` is enabled, each suggestion sends a bounded window of the current document (a fixed number of lines before the cursor and a bounded suffix after it) using the explicitly selected inline entry's API key to the same `/chat/completions` endpoint. Upstream error bodies are never surfaced or logged because they can echo prompt context, and suggestion text flows only into the editor's ghost text. The feature is disabled by default.

## Logging

Debug logs contain model IDs, request state, retries, usage counters, and error summaries. They exclude API keys, authorization headers, prompts, tool arguments, and response text. Credential references are short one-way hashes used only to isolate in-memory and persisted model catalogs.

Image generation uses only the explicitly selected `imageEntry`; it never silently borrows the active chat or management key. Missing selections fail closed.

Forgotten entry IDs remain blocked across restarts, so native model discovery cannot automatically revive them. Use **Orvix: Restore Native Entry** to intentionally provision that ID again, then re-import its billing session. This stores only the forgotten IDs, never keys or account information.
