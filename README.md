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

## Install (local)
1) Build VSIX:
   - `npm ci`
   - `npm run compile`
   - `npm run package`
2) In Cursor: Extensions → “Install from VSIX…”

## Use
- Run: `GoalGuard: Enable in Workspace`
- Then run: `GoalGuard: Start Supervisor Session`

If prompt injection doesn’t auto-send in your Cursor build, the extension will copy the bootstrap prompt to your clipboard and ask you to paste+enter once.

## Development
- `npm run watch`
- Run extension host in VS Code/ Cursor dev mode as usual.

## Notes
- GoalGuard keeps internal artifacts in `.ai/` in the target workspace and app code remains clean.
