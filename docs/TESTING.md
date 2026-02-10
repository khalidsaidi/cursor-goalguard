# Testing

## 1) Extension tests (no Cursor required)
Runs in a VS Code extension host environment.

- `npm test`

This validates:
- command wiring
- workspace scaffolding outputs
- safety properties (managed overwrite behavior)

## 2) Protocol tests (Cursor CLI)
Runs the Cursor agent CLI against a temp workspace with GoalGuard templates.

- `npm run test:protocol`

Notes:
- Requires Cursor CLI installed (binary names vary: `cursor`, `agent`, or `cursor-agent`).
- Requires authentication. If you are not logged in you will see:
  `Authentication required. Please run 'cursor agent login' first, or set CURSOR_API_KEY environment variable.`
- Guarded by hard timeouts and includes fallbacks if print mode hangs.
- The harness will try a few models automatically to avoid "usage limit" failures; you can override with `GOALGUARD_PROTOCOL_MODEL`.
- Verifies `.cursor/rules` are actually being loaded by the CLI by adding a temporary marker rule in the test workspace (the prompt does not mention the marker token).

If you do not have Cursor CLI installed/authenticated, you can allow skip:

```bash
GOALGUARD_PROTOCOL_SKIP_OK=1 npm run test:protocol
```

To login non-interactively (no browser auto-open):

```bash
NO_OPEN_BROWSER=1 cursor agent login
```

To force a specific model:

```bash
GOALGUARD_PROTOCOL_MODEL=composer-1.5 npm run test:protocol
```

## 3) Manual UI tests (Cursor in Codespaces)
If you want to validate the extension inside a real Cursor desktop UI (not just the VS Code extension host harness), use the Codespaces runbook:
- `docs/CODESPACE_CURSOR_UI.md`
