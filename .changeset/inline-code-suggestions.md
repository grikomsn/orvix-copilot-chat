---
"orvix-copilot-chat": minor
---

Add experimental, opt-in inline code suggestions (ghost text) powered by the Orvix gateway with `reasoning_effort: "none"`. Enable with `orvixCopilot.inlineSuggestions` and choose the model (`inlineSuggestionsModel`, default `orvix/deepseek-v4-pro`; the only model live-measured to honor the switch with zero hidden reasoning). Debounce, timeout, token budget, and context windows are configurable. The Copilot Chat prompt box is excluded unless separately enabled, and document context is never logged.