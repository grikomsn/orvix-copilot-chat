---
"orvix-copilot-chat": major
---

Use VS Code native provider entries exclusively, with required unique entryId values and separate explicit management, inline suggestion, and image generation selections. Keep model selections stable during key rotation while retiring stale request handles and isolating inference usage and catalog caches. Forgotten IDs stay blocked across restarts until explicitly restored; automatic model discovery cannot revive their credentials.

Bind each imported browser billing session explicitly to its selected entry and current credential. Reject stale billing updates after session replacement, rotation, or forgetting an entry, and persist only local inference activity and minimal entry observations. Command-managed API keys and unbound billing sessions are no longer read or migrated; recreate native entries and re-import their owning billing sessions.

Preserve incremental reasoning and text order, close thinking on every terminal path, uniquely identify missing tool calls, join parallel index/ID argument fragments, handle fragmented CRLF, and clean up cancelled or failed streams. Keep successful empty model directories authoritative and preserve raw managed orvix/* and BYOK routing.
