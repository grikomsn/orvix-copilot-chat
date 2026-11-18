---
"orvix-copilot-chat": patch
---

Fix tool-result ordering and detect empty completions

- Tool results now directly follow the assistant tool calls they answer, ahead of any user text sent in the same turn.
- Repeated full tool names are no longer concatenated, named non-message SSE events such as metrics trailers are ignored, and empty or tool-less completions are reported as errors.
- Request bodies no longer carry lone UTF-16 surrogates; HTTP errors show only a bounded message from structured error bodies; inline suggestions strip code fences; the picker shows cached-input prices.

Shared provider plumbing now comes from the copilot-chat-kit submodule, so fixes land in every Copilot Chat provider extension at once.
