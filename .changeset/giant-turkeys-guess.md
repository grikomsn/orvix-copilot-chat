---
"orvix-copilot-chat": patch
---

Fix Auto context size being interpreted as zero input tokens by VS Code, collapsing the context indicator to the output reserve and triggering premature compaction.

Reserve up to 32K response tokens by default instead of subtracting the entire output capability from the context window. Honor positive live shared-context limits independently of output capability.
