---
"orvix-copilot-chat": minor
---

Add experimental, opt-in inline code suggestions (ghost text) powered by the Orvix gateway with `reasoning_effort: "none"`. Enable with `orvixCopilot.inlineSuggestions` and choose the model (`inlineSuggestionsModel`, default `orvix/deepseek-v4-pro`; the only model live-measured to honor the switch with zero hidden reasoning). A new **Orvix: Set Inline Suggestions Model** command (also in the Manage menu) lists models whose verified thinking profile includes `none`, ordered cheap-and-fast first with measured badges and warnings; a custom model id remains enterable. Debounce, timeout, token budget, and context windows are configurable. The Copilot Chat prompt box is excluded unless separately enabled, and document context is never logged.
