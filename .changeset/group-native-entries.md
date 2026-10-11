---
"orvix-copilot-chat": major
---

Replace stable entry IDs with group-name native entries

Provider entries now use only a VS Code-owned API key; the entry's group name is its label. Credentials, catalogs, usage, and billing sessions are scoped by a one-way fingerprint of the key instead of an explicit `entryId`, and model IDs are the raw hosted IDs because the host namespaces them per group.

- Add an Orvix entry with just an API key (no Entry ID field).
- Remove the Select/Forget/Restore entry commands and the `managementEntry`, `inlineSuggestionsEntry`, and `imageEntry` settings; management, inline suggestions, and image generation use the active (most recently provisioned) key.
- Import the billing session for the active credential instead of a selected entry.
- Recreate existing entries with the new single-field flow and re-import any billing session; old entry IDs are not migrated.
