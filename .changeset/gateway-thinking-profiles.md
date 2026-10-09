---
"orvix-copilot-chat": patch
---

Add live-verified thinking profiles for GLM 5.3 Flash, DeepSeek V4.1 Flash, and MiMo

Live probes against the Orvix API (2026-10-09) verified that these managed routes accept `reasoning_effort` and diverge from sibling providers' stricter gateways:

- `orvix/glm-5.3-flash` accepts `none | low | high | max` (ai& rejects `none`; Orvix genuinely disables thinking with it)
- `orvix/deepseek-v4.1-flash` accepts `none | low | high | max` (ai& rejects `low`)
- `orvix/mimo-v2.5`, `orvix/mimo-v2.5-pro`, and `orvix/mimo-v2.6-pro` accept `none | low | high` (the routes also tolerate `default`, which is deliberately not offered since upstream treats it as "send nothing")

All three previously had no model picker because no profile was registered; they now expose the Reasoning Effort control with `high` as the default. `:free` variants inherit the paid id's profile via the existing fallback chain.
