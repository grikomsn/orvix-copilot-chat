---
"orvix-copilot-chat": minor
---

Harden the `orvixImages` tool and add a configurable default image model. Space out pre-stream image retries with the shared backoff policy (honoring `Retry-After`), bound tool invocations to a 120-second timeout, and return actionable error guidance for rate limits and Orvix-side 502 outages. `model` is now optional in the tool schema: omitted or unknown models fall back to the new `orvixCopilot.defaultImageModel` setting (default `flux-2-pro`), configurable via the new **Orvix: Set Default Image Model** command and the Manage Connection menu, so a calling model's bad slug guess can no longer block generation.
