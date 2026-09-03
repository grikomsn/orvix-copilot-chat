---
"orvix-copilot-chat": patch
---

Fix the reasoning effort picker not appearing in the Copilot model picker. The reasoning schema was spread directly onto the model info object instead of nested under `configurationSchema`, so VS Code never rendered the toggle. Reasoning-capable Orvix models now expose their per-model Reasoning Effort values.