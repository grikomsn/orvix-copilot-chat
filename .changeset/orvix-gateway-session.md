---
"orvix-copilot-chat": patch
---

Fix credits/usage tracking on the Orvix gateway. The gateway is authenticated by a user session (the API key is inferencing-only), so add an **Orvix: Import Usage Session** command to paste the browser session token, stored in Secret Storage, and use it for billing and usage. When no session is present, the usage view degrades gracefully: it shows locally tracked request/token totals from the inference stream, hints at the **Import usage session** fix, and explains the browser sign-in requirement instead of a raw 401. Refreshing explicitly from the usage quick pick offers to import a session. Also surface the IDR account balance, active plans, and top-up history from `/balance` and `/balance/topups`.
