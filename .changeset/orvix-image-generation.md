---
"orvix-copilot-chat": minor
---

Add an image-generation language-model tool (`orvixImages`, contributed as `orvix-copilot-chat_generateImage`) that calls the Orvix `POST /v1/images/generations` endpoint and spends prepaid Image Credits. It supports the image catalogue models (flux-2-pro, qwen-image-3.0, gpt-image-2, grok-imagine-image, seedream-5.0-pro, midjourney, gemini-3-pro-image), returns hosted image URLs plus the credits spent, and never inlines image bytes into the model context. Image Credits are now tracked separately from USD credits: with a gateway session imported, the status bar, tooltip, and usage quick pick show the remaining Image Credits summed from active `grantsImage` plans, and live per-model credit costs come from the gateway `models/catalogue` (with a bundled fallback table when no session is available).
