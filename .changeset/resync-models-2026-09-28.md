---
"orvix-copilot-chat": patch
---

Resync the managed Orvix catalog with the live `/v1/models` response (verified 2026-09-28 with a fresh project key):

- Add newly served managed routes: `orvix/grok-4.7` (replacing `grok-4.6`, which live no longer serves), `orvix/atria-dawn-preview`, `orvix/jev`, and the `:free` variants `deepseek-v4-flash:free`, `gemini-3.5-flash:free`, `glm-5.3-flash:free`, `gpt-5.6-luna:free`, `grok-4.3:free`, `grok-4.7:free` — with live-advertised capabilities and the `gpt-5.6-luna:free` reasoning profile.
- Correct the offline `orvix/glm-5.3-flash` fallback to advertise vision input and tool calling, matching the live catalog.
- Keep image-generation routes (`flux-*`, `midjourney`, `seedream-*`) out of the Copilot Chat model picker.
- Replace the offline fallback pairing `orvix/auto` + `orvix/muse-spark-1.2` with `orvix/auto` + `orvix/gpt-5.6-terra`, since live no longer serves Muse Spark; retired ids (`muse-spark-1.2/1.3`, `grok-4.6`) remain in the enrichment map in case Orvix re-serves them.
- Add Grok 4.7's upstream estimate ($2 in / $0.50 cached / $6 out per 1M tokens, mirroring Grok 4.6); free variants get no price estimate (never guessed).
