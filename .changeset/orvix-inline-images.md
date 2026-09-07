---
"orvix-copilot-chat": minor
---

Inline generated images into chat responses. The `orvixImages` tool now
attaches each generated image to its tool result as an image data part, so
images render directly in the Copilot Chat thread (matching the built-in
browser screenshot tool) instead of URL-only text. Inlining is unconditional
and best-effort: hosted URLs are fetched with a per-image 30 s timeout and a
10 MB cap, `b64_json` responses decode directly, and any fetch or size failure
just skips that image — the URLs and credits text are always present.
Vision-capable chat models receive the inlined bytes on later turns and can
iterate on their own generated images; requests from non-vision Orvix models
degrade tool-result images to a `[image/… data omitted]` placeholder at the
conversion layer, so threads survive model switches to text-only models.
