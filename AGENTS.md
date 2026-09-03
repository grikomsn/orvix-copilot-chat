# Repository guidance

## Scope and setup

- These instructions apply to the entire repository.
- This is a TypeScript VS Code extension. Use Node.js 22+ and npm; `package-lock.json` is authoritative.
- Install from a clean checkout with `npm ci`.

## Code map

- `src/extension.ts`: activation and dependency wiring.
- `src/commands/commands.ts`: commands, diagnostics, and connection workflows.
- `src/auth/auth.ts`: API-key validation and Secret Storage.
- `src/provider.ts`: VS Code chat-provider integration and live model discovery.
- `src/provider/`: message conversion, request construction, response reporting, and retry policy.
- `src/models/`: catalog persistence and capability/pricing enrichment.
- `src/transport/`: endpoints, errors, and incremental SSE parsing.
- Tests are colocated as `src/**/*.test.ts`; `out/` and `*.vsix` are generated artifacts.

## Commands

- `npm run compile` — clean and type-check into `out/`.
- `npm test` or `npm run check` — compile and run all Node test files.
- `npm run package` — validate and build the installable VSIX.
- `npm run watch` — compile continuously; press F5 with the launch configuration for an Extension Development Host.

## Working agreements

- Keep changes focused and follow the existing strict TypeScript style: explicit public types, small helpers, double quotes, and two-space indentation.
- Add or update colocated `node:test` coverage for behavior changes. Network paths must use injected fakes rather than live services.
- Store command-managed credentials in VS Code `SecretStorage`; never log or commit keys, prompts, tool arguments, responses, or account data.
- Treat the live Orvix `/models` response as authoritative. Persist it for unavailable refreshes, but never merge stale entries into a successful response.
- Preserve Orvix's managed `orvix/*` and unprefixed BYOK model IDs. Do not guess prices or send undocumented request fields.
- Retry only pre-stream transient failures and keep protocol-specific behavior covered by tests.
- When commands, settings, models, security behavior, or workflows change, keep `package.json`, tests, and documentation synchronized.
- Do not commit generated `out/`, source maps, VSIX files, logs, or unrelated dependency churn.

## Before handing off

- Run the narrowest relevant test while iterating, then `npm run check`.
- Also run `npm run package` for manifest, packaging, or release-facing changes.
- Add a Changeset for user-visible published-extension changes.
