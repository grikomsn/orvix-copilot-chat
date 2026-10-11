# Security model

Orvix API keys are owned by VS Code's native secret provider configuration. The extension keeps provisioned keys only in memory and never reads command-managed keys or unbound legacy billing sessions. Keys are not copied into settings, files, extension logs, or this repository.

Each entry is identified by its VS Code group name, which is only a display label. Catalog, usage, and billing scopes use a one-way fingerprint of the entry's key, so identical keys share state and distinct keys stay isolated. Model IDs are the raw hosted IDs because the host namespaces them per group.

Browser billing sessions remain in `SecretStorage`, bound to one credential fingerprint. The user imports the session for the active credential; no label or fingerprint proves account ownership. Re-provisioning keys does not move the binding; re-import to rebind. Late billing responses cannot overwrite a newer session binding. Account balances, project metadata, and billing transactions are not persisted; only inference activity totals are stored, keyed by credential fingerprint.

Use a dedicated project key with only the `ai:invoke` scope. Orvix keys can carry a per-key rate limit and monthly spend limit; set those controls in the Orvix Platform and rotate or revoke the key there when it is no longer needed.

## Network access

The extension contacts:

- `https://api.orvix.id/v1/models` for project-scoped model discovery and validation
- `https://api.orvix.id/v1/chat/completions` for inference
- `https://models.dev/api.json` for best-effort capability metadata only

The live Orvix catalog remains authoritative. Prompt and tool content is sent only to Orvix for inference. The extension never sends the Orvix API key, prompts, or responses to models.dev.

## Inline completions

When `orvixCopilot.inlineSuggestions` is enabled, each suggestion sends a bounded window of the current document (a fixed number of lines before the cursor and a bounded suffix after it) using the most recently provisioned key to the same `/chat/completions` endpoint. Upstream error bodies are never surfaced or logged because they can echo prompt context, and suggestion text flows only into the editor's ghost text. The feature is disabled by default.

## Logging

Debug logs contain model IDs, request state, retries, usage counters, and error summaries. They exclude API keys, authorization headers, prompts, tool arguments, and response text. Credential references are short one-way hashes used only to isolate in-memory and persisted model catalogs.

Image generation uses the active entry's API key (the most recently provisioned one); it never sends a prompt without a provisioned key and fails closed otherwise.
