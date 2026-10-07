---
"orvix-copilot-chat": patch
---

Resync bundled model metadata with the live Orvix catalog: add managed
fallback entries for `deepseek-v4.1-flash`, `hy3`, `hy4-preview`, and
`mimo-v2.6-pro`, and drop the retired `glm-5.3-flash:free` and
`grok-4.7:free` routes from the bundled list (free routes still inherit
their paid id's metadata if the routes return).
