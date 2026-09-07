---
"orvix-copilot-chat": patch
---

Report each model's `maxInputTokens` as context minus the output budget so the picker's context window matches the model's real usable input and no longer collapses to the output cap.
