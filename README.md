# GoalGuard: Two-Layer Agents for Cursor (Extension)

GoalGuard installs a **Supervisor ↔ Worker** workflow into your Cursor workspace, with **.ai/** workspace memory to prevent drift.

## What it does (keyless)
- The extension does **not** call OpenAI/Anthropic/etc.
- It **uses Cursor’s built-in Agent runtime** (the user is already logged into Cursor / subscription).
- It scaffolds:
  - `.cursor/rules/` (always-on Supervisor protocol)
  - `.cursor/agents/` (Worker + Verifier + Repo-Searcher subagents)
  - `.cursor/commands/` and `.cursor/skills/`
  - `.ai/` memory (`goal.md`, `plan.md`, `task-ledger.md`)

## Why two layers
- **Supervisor** stays high-level: goal, constraints, acceptance criteria, reporting cadence.
- **Worker** spends context on details: files, debugging, commands.
- **Verifier** catches drift before “done” is claimed.

See [docs/30-SECOND-EXAMPLE.md](docs/30-SECOND-EXAMPLE.md) for a concrete scenario (dark mode toggle): User → Supervisor → Repo-Searcher / Worker / Verifier → Supervisor → User.

## Install (local)
1) Build VSIX:
   - `npm ci || npm install`
   - `npm run compile`
   - `npm run package`
2) In Cursor: Extensions → “Install from VSIX…”

## Use
- Run: `GoalGuard: Enable in Workspace`
- Then run: `GoalGuard: Start Supervisor Session`

If prompt injection doesn’t auto-send in your Cursor build, the extension will copy the bootstrap prompt to your clipboard and ask you to paste+enter once.

If your Cursor build supports subagents, you can explicitly invoke them in chat via:
- `/goalguard-worker ...`
- `/goalguard-verifier ...`
- `/goalguard-repo-searcher ...`

## Repair / Force Reinstall (Safe)
Run: `GoalGuard: Force Reinstall Templates (Repair)`

- Overwrites only GoalGuard-managed templates under `.cursor/` (rules/agents/commands/skills).
- Does **not** overwrite your `.ai/` memory files like `.ai/goal.md`, `.ai/plan.md`, etc.
- If you want to permanently opt out of overwrites for a `.cursor/` file, remove the `goalguardManaged: true` / `<!-- goalguard:managed -->` marker from it.

## Headless Workspace Init (No UI)
If you want to scaffold GoalGuard into a workspace from the terminal:

```bash
node scripts/goalguard-init.mjs --workspace /path/to/your/project
```

## Testing (cursor-extension-tester)

Plans and verification live in this repo. The tester is only useful when it **catches failures**; these checks are designed to fail when GoalGuard regresses. **Note:** A passing run only proves that Enable created the promised files (scaffolding). It does **not** prove that Cursor runs the two-layer workflow (rule applied, custom agents invokable). See `docs/WHAT-GOALGUARD-DOES.md` for what "working" really means.

- **`npm test`** — Compile, then run workspace verify on `.`, then run **test-catch-failure**: simulates a missing `.ai/goal.md` and asserts the verify script correctly reports FAIL. Proves the test catches regressions.
- **`npm run verify`** — Run workspace init contract: `node scripts/verify-workspace-init.js [workspace-path]`. Use `.` or a path; no Cursor required.
- **Plans:** `plans/goalguard-health.plan.json` (smoke), `plans/goalguard-works.plan.json` (scaffolding + intent), **`plans/goalguard-full-loop-proof.plan.json`** (definite proof). See `docs/WHAT-GOALGUARD-DOES.md` for what each validates.
- **Definite proof (full loop):** When **`goalguard-full-loop-proof.plan.json`** passes all 10 steps, you have proof: Supervisor set goal → delegated to Worker → Worker created `.ai/scratch/proof.txt` → Verifier ran → Supervisor reported back. Same flow as `docs/30-SECOND-EXAMPLE.md`. Run: from cursor-extension-tester, `cet run --workspace $(pwd) --plan $(pwd)/plans/goalguard-full-loop-proof.plan.json --target-vsix $(pwd)/cursor-goalguard-0.1.0.vsix --seed-config-from-host --cursor-version 2.4.32`. If Docker intent steps fail (no state), re-run or run the plan in local Cursor.
- **Run in Cursor:** Install cursor-extension-tester + this VSIX, set plan path to e.g. `plans/goalguard-works.plan.json`, run default plan.
- **Run via cet (Docker):** From cursor-extension-tester repo: `npm run cli -- run --workspace <path> --plan <path/to/this/repo>/plans/goalguard-works.plan.json --target-vsix <path/to/cursor-goalguard-0.1.0.vsix>`.

## Development
- `npm run watch`
- Run extension host in VS Code/ Cursor dev mode as usual.

## Testing
- `npm test` - VS Code extension host tests (no Cursor required).
- `npm run test:protocol` - Cursor CLI protocol regression test (requires Cursor CLI + auth; guarded by timeouts).
  - If needed: `cursor agent login` (or `NO_OPEN_BROWSER=1 cursor agent login`)
  - Optional: `GOALGUARD_PROTOCOL_MODEL=composer-1.5 npm run test:protocol`

## Codespaces (Cursor UI)
If you want to test GoalGuard inside a real Cursor desktop UI running in a GitHub Codespace (streamed via VNC/noVNC), see:
- `docs/CODESPACE_CURSOR_UI.md`

## Notes
- GoalGuard keeps internal artifacts in `.ai/` in the target workspace and app code remains clean.
- In GitHub Codespaces, Cursor login can fail if `https://auth.cursor.sh` is unreachable; the Codespaces runbook includes a workaround path and the recommended fallback tests.
