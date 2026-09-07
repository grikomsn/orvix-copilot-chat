---
"orvix-copilot-chat": minor
---

Enrich model metadata with best-effort per-token pricing. Orvix does not disclose per-token rates on its model endpoint, so the extension now reports pricing from live API data when a provider advertises it, otherwise falling back to the upstream provider's published USD per-1M-token rates (sourced from models.dev) for managed `orvix/*` models. BYOK models without either source show no price rather than a guessed one. Pricing surfaces in the model picker, usage tooltip, and usage quick pick. Models.dev metadata now round-trips cost through the persisted cache, and unknown managed models no longer get a fabricated price.
