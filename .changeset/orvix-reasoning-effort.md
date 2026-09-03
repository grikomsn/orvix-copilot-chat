---
"orvix-copilot-chat": minor
---

Add a reasoning-effort toggle for Orvix models that support it. Reasoning-capable models now expose a **Reasoning Effort** picker in the Copilot model picker, with values verified per model against the live Orvix API (e.g. `orvix/glm-5.3-flash` exposes `low`/`high`, `orvix/gpt-5.6-luna` exposes `low`/`medium`/`high`/`max`, and most other reasoning models expose `minimal`/`low`/`medium`/`high`/`max`). A new `orvixCopilot.reasoningEffort` setting (default `high`) controls the default, per-request picker selections override it, and unsupported values fall back to the model's profile default. The effort is surfaced in diagnostics and the test-inference command.
