# What GoalGuard is supposed to do

GoalGuard is a **two-layer agent harness for Cursor**: a user-facing **Supervisor** delegates to Worker/Verifier subagents and uses a `.ai` workspace memory. No API keys.

**Concrete example:** See [30-SECOND-EXAMPLE.md](30-SECOND-EXAMPLE.md) for a full walkthrough (dark mode toggle) showing exactly what you'd see and how the two layers work.

## What “working” really means

GoalGuard’s **value** is the workflow: when you run **Start Supervisor**, you get an Agent chat that (1) follows the always-on rule (checkpoints, cadence, delegation), (2) can **delegate** to the custom agents (`goalguard-worker`, `goalguard-verifier`, `goalguard-repo-searcher`) defined in `.cursor/agents/`, and (3) uses `.ai/goal.md` and `.ai/plan.md` as shared memory. That only works if **Cursor** actually applies the rule in Agent/Composer and supports invoking those custom agents by name. The extension only **scaffolds** files; Cursor has to run the workflow.

So “GoalGuard works” means: **Cursor runs the two-layer workflow** (rule applied, agents invokable, Supervisor delegating). “GoalGuard doesn’t work” can mean: Cursor doesn’t apply the rule, doesn’t support custom agents the way we expect, or Start Supervisor doesn’t open a chat that behaves as the Supervisor. Our **tests do not check that**. They only check scaffolding.

## Intended behavior (extension side)

1. **Enable in Workspace** (`goalguard.enableWorkspace`)
   - Creates `.ai/` (goal.md, plan.md, task-ledger.md, runs, scratch, work-orders).
   - Creates `.cursor/rules/100-goalguard-two-layer.mdc` and `.cursor/agents/` (goalguard-worker.md, goalguard-verifier.md, goalguard-repo-searcher.md), `.cursor/skills/goalguard-supervisor/`.
   - Patches `.gitignore` to include `.ai/`.
   - Writes `.ai/.goalguard-manifest.json`.
   - “Enabled” is defined as: the rule file exists (`isWorkspaceEnabled`).

2. **Doctor** (`goalguard.doctor`)
   - Checks presence of those key files and reports ✅/❌ for each (rule, agents, .ai files, .gitignore).

3. **Start Supervisor** (`goalguard.startSupervisor`)
   - Ensures workspace is enabled, then opens Agent chat with a bootstrap prompt (Cursor-specific commands + clipboard fallback). Not realistically testable in headless automation.

4. **Force Reinstall** (`goalguard.forceReinstall`)
   - Shows a modal “Continue?” then overwrites managed files. Blocks automation.

## What “really works” means for testing

- **Smoke (health)**: Extension installed, activated, commands registered, and `goalguard.doctor` runs without throwing.  
  → Plan: `plans/goalguard-health.plan.json`.  
  → Does **not** prove that enabling the workspace actually created files.

- **Real behavior**: After running **Enable in Workspace**, the files GoalGuard claims to create must exist.  
  → Plan: `plans/goalguard-works.plan.json` (enable then assertFileExists for those paths).  
  → Without Cursor: `node scripts/verify-workspace-init.js <workspace>` (same contract, uses this repo’s templates).

- **Intent (100%)**: After **Start Supervisor**, the Agent chat should behave as the Supervisor and know about subagents.  
  → The plan includes **sendPromptAndAssertResponseContains** steps: send “What is your role? Reply with exactly one word.” and assert the response contains “Supervisor”; then send “Which subagents can you delegate to?” and assert the response contains “goalguard-worker”. So the run verifies that the rule/context is applied and the Agent identifies as Supervisor with knowledge of the delegate agents.

So: **goalguard-health** only checks “extension and commands are there.” **goalguard-works** checks scaffolding plus **intent** (Supervisor role and subagents known in chat).

- **Definite proof (full loop)**: Run **`plans/goalguard-full-loop-proof.plan.json`** (via cursor-extension-tester). When all steps pass, you have **proof** that: (1) Supervisor set a goal and delegated to **goalguard-worker**; (2) the Worker created `.ai/scratch/proof.txt` with "Delegation worked" (steps assert file exists + content); (3) Supervisor ran **goalguard-verifier** and reported back. So: **goal → Worker → file on disk → Verifier → Supervisor reply**. From cursor-extension-tester: `cet run --workspace <path-to-cursor-goalguard> --plan <path>/plans/goalguard-full-loop-proof.plan.json --target-vsix <path>/cursor-goalguard-0.1.0.vsix --seed-config-from-host --cursor-version 2.4.32`. If Docker intent steps fail (no state), re-run or run the plan in local Cursor.

**Why the test can pass and GoalGuard still “not work”:** The plan only asserts that **Enable** created the rule, agents, and `.ai` files. It does **not** verify that Cursor applies the rule in chat, that Cursor invokes the custom agents, or that **Start Supervisor** opens a chat that actually behaves as the Supervisor. Those depend on Cursor’s product behavior. So **pass = scaffolding succeeded**. To know if the workflow runs, you have to try it manually (Start Supervisor, delegate to Worker/Verifier) and see if Cursor does what the rule describes.
