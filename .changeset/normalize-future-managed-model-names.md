---
"orvix-copilot-chat": patch
---

Improve display-name normalization for model IDs that are not yet in the managed catalog: future `orvix/*` entries drop the redundant vendor prefix and recurring families render with vendor casing (`GPT`, `GLM`, `MiMo`, `DeepSeek`, `MiniMax`, title-cased `Qwen`/`Kimi`).