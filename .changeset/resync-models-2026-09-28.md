---
"orvix-copilot-chat": patch
---

Keep Orvix image-generation routes (`flux-*`, `midjourney`, `seedream-*`) out of the Copilot Chat model picker, and correct the offline `orvix/glm-5.3-flash` fallback to advertise tool calling, matching what the live catalog serves.