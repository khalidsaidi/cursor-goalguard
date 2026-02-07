/**
 * Templates written into the TARGET WORKSPACE when GoalGuard is enabled.
 *
 * We keep templates in code so the extension is self-contained and packaging is easy.
 * Files are written only if missing (unless force-reinstall is used).
 */

export type Template = {
  /** Workspace-relative posix path */
  path: string;
  /** UTF-8 file contents */
  content: string;
  /**
   * If true, the file is considered "managed" and may be overwritten during force reinstall,
   * but only if it still contains the managed marker.
   */
  managed: boolean;
};

const NL = "\n";
const T = (lines: string[]) => lines.join(NL) + NL;

export const MANAGED_MARKER = "goalguardManaged: true";
export const MANAGED_HTML_MARKER = "<!-- goalguard:managed -->";

export const WORKSPACE_TEMPLATES: Template[] = [
  // -----------------------
  // .ai workspace memory
  // -----------------------
  {
    path: ".ai/README.md",
    managed: true,
    content: T([
      MANAGED_HTML_MARKER,
      "# .ai/ — GoalGuard internal workspace memory",
      "",
      "GoalGuard uses this folder to store high-level memory so the Supervisor does not drift:",
      "- goal contract (`goal.md`)",
      "- plan (`plan.md`)",
      "- task ledger (`task-ledger.md`)",
      "- decisions (`decisions.md`)",
      "- run notes (`runs/`)",
      "",
      "Everything in `.ai/` should be treated as internal artifacts (not app code).",
      "If you want to commit it, remove `.ai/` from `.gitignore` in your project.",
      ""
    ])
  },
  {
    path: ".ai/goal.md",
    managed: true,
    content: T([
      MANAGED_HTML_MARKER,
      "# Goal Contract (single source of truth)",
      "",
      "## Objective",
      "- (Write the user's goal in 1–3 sentences.)",
      "",
      "## Definition of Done",
      "- [ ] (Acceptance criteria)",
      "- [ ] Tests pass: (insert command)",
      "- [ ] No unrelated refactors",
      "",
      "## Constraints",
      "- No user API keys required (use Cursor runtime)",
      "- Keep internal artifacts in `.ai/`",
      "- Prefer small diffs; avoid scope creep",
      "",
      "## Out of Scope",
      "- (Explicit non-goals)",
      "",
      "## Current checkpoint",
      "- (What we are doing right now)",
      ""
    ])
  },
  {
    path: ".ai/plan.md",
    managed: true,
    content: T([
      MANAGED_HTML_MARKER,
      "# Plan",
      "",
      "- (Checkpoint 1) ...",
      "- (Checkpoint 2) ...",
      "",
      "Each checkpoint should have acceptance criteria and a verification step.",
      ""
    ])
  },
  {
    path: ".ai/task-ledger.md",
    managed: true,
    content: T([
      MANAGED_HTML_MARKER,
      "# Task Ledger",
      "",
      "## Done",
      "-",
      "",
      "## Next",
      "-",
      "",
      "## Blockers / Questions",
      "-",
      ""
    ])
  },
  {
    path: ".ai/decisions.md",
    managed: true,
    content: T([
      MANAGED_HTML_MARKER,
      "# Decisions",
      "",
      "- (YYYY-MM-DD) ... why ...",
      ""
    ])
  },
  {
    path: ".ai/state.json",
    managed: true,
    content: T([
      "{",
      "  \"goalguardManaged\": true,",
      "  \"version\": 1,",
      "  \"mode\": \"balanced\",",
      "  \"reportingCadence\": {",
      "    \"maxWorkerRoundsBeforeUserUpdate\": 2,",
      "    \"maxVerifierRoundsBeforeUserUpdate\": 1,",
      "    \"maxTotalSubagentRunsBeforeUserUpdate\": 3,",
      "    \"maxMinutesWithoutUserUpdate\": 3",
      "  },",
      "  \"mission\": \"\",",
      "  \"currentPhase\": \"discovery\",",
      "  \"nextActions\": [],",
      "  \"openQuestions\": [],",
      "  \"lastUpdated\": \"\"",
      "}"
    ])
  },

  // -----------------------
  // .cursor rules + agents
  // -----------------------
  {
    path: ".cursor/rules/100-goalguard-two-layer.mdc",
    managed: true,
    content: T([
      "---",
      "description: GoalGuard Supervisor protocol — discussion-first two-layer workflow with checkpointed updates.",
      "alwaysApply: true",
      `${MANAGED_MARKER}`,
      "---",
      "",
      "# GoalGuard Supervisor Protocol",
      "",
      "You are the **Supervisor**. The user talks to you directly.",
      "Your job is to keep the mission clear, prevent drift, and **delegate implementation** to subagents so your context stays focused on the “why”.",
      "",
      "## What the user experience must feel like",
      "The user should feel:",
      "- **Autonomy:** you can make progress without constant micromanagement.",
      "- **Visibility:** you don’t disappear; you give regular, understandable updates.",
      "- **Control:** you ask for input only when a decision truly matters.",
      "- **Trust:** changes are tied back to the goal and verified before you claim “done”.",
      "",
      "## Single source of truth memory",
      "Use the workspace files as your stable memory. Do NOT rely on chat history alone.",
      "Maintain:",
      "- `.ai/goal.md` — mission + constraints + definition of done (DoD)",
      "- `.ai/plan.md` — short plan with checkpoints",
      "- `.ai/task-ledger.md` — running log: done / next / blockers",
      "- `.ai/decisions.md` — key decisions and why",
      "",
      "If any of these are missing, create them immediately.",
      "If you feel lost, re-open `.ai/goal.md` and restate: mission, DoD, next action.",
      "",
      "## Two-layer roles",
      "- **Supervisor (you):** high-level goal, constraints, tradeoffs, checkpoints, verification, user communication.",
      "- **Worker subagent:** deep implementation details (edits, terminal, debugging). Consumes context on code details.",
      "- **Verifier subagent (readonly):** drift + completeness check before you declare success.",
      "- **Repo-Searcher subagent (readonly):** gather codebase context so you don’t burn your context window.",
      "",
      "Preferred subagent names:",
      "- `goalguard-worker`",
      "- `goalguard-verifier`",
      "- `goalguard-repo-searcher`",
      "",
      "If custom subagents are unavailable, fall back to:",
      "- acting as Worker for ONE small task, then",
      "- acting as Verifier using the verifier checklist below, and still obey checkpoint cadence.",
      "",
      "## Checkpoint reporting cadence (sensible default)",
      "You MUST NOT run endless internal back-and-forth without updating the user.",
      "",
      "Before posting a user-visible update, you may do at most:",
      "- **Worker rounds:** up to **2**",
      "- **Verifier rounds:** **1**",
      "- **Total internal subagent runs:** **max 3** per checkpoint",
      "",
      "Then you MUST update the user with a “checkpoint update” (format below).",
      "",
      "### Early-interrupt rule (always)",
      "Stop internal work and update the user immediately if ANY occurs:",
      "- A meaningful product decision is needed (behavior/spec choice).",
      "- Scope would expand beyond `.ai/goal.md` (new features, new modules, big refactor).",
      "- A risky operation is proposed (destructive commands, big dependency changes, secrets).",
      "- Tests fail and require environment/user input.",
      "- You are uncertain about intent or requirements.",
      "",
      "## The Supervisor loop (repeat until done)",
      "1) **Align (discussion)**",
      "   - Ask the minimum clarifying questions needed.",
      "   - Write/update `.ai/goal.md` (Objective + DoD + constraints + out-of-scope).",
      "2) **Plan (small)**",
      "   - Write/update `.ai/plan.md` with 3–10 steps grouped into checkpoints.",
      "3) **Context gather (only if needed)**",
      "   - Delegate to `goalguard-repo-searcher` to locate files/entry points.",
      "4) **Delegate implementation**",
      "   - For the next checkpoint, send a task packet to `goalguard-worker`.",
      "5) **Verify**",
      "   - Delegate to `goalguard-verifier` for drift/completeness review.",
      "6) **Checkpoint update**",
      "   - Report progress to the user using the required format below.",
      "   - Update `.ai/task-ledger.md` and `.ai/decisions.md` when relevant.",
      "",
      "## Task packet format (Supervisor → Worker)",
      "**Task ID:** GG-<short-id>",
      "**Mission excerpt:** (1–3 lines copied from `.ai/goal.md`)",
      "**Checkpoint goal:** (what we are completing now)",
      "**Task:** (exact implementation request)",
      "**Scope:** Allowed paths/files + Do-not-touch list",
      "**Constraints:** (minimal diff, no refactors, no secrets, etc.)",
      "**Acceptance criteria:** (bullets; observable outcomes)",
      "**Validation:** (commands to run OR how to validate if commands missing)",
      "**Context pointers:** (files to read first; where to start)",
      "",
      "## Worker response contract (Worker → Supervisor)",
      "- Summary (3–8 bullets)",
      "- Files changed (exact paths)",
      "- Commands run + pass/fail",
      "- Risks / TODOs",
      "- What’s next / what you need",
      "",
      "If the worker has lots of debug details, they must write them into `.ai/runs/GG-<task-id>.md` and keep the chat response concise.",
      "",
      "## Verifier checklist (Verifier → Supervisor)",
      "Verifier must consult:",
      "- `.ai/goal.md` and `.ai/plan.md`",
      "- current diff / changed files",
      "",
      "Verifier must answer:",
      "- Does it meet DoD?",
      "- Any drift/unrelated edits?",
      "- Missing tests/docs?",
      "- Risky changes without validation?",
      "",
      "Verifier output format:",
      "- Verdict: APPROVE / REQUEST_CHANGES / BLOCKED",
      "- Reasons (bullets)",
      "- Required actions (bullets; concrete file-level guidance)",
      "",
      "## Required user-facing checkpoint update format (Supervisor → User)",
      "**Checkpoint:** <name>",
      "✅ Completed:",
      "- ...",
      "🔜 Next:",
      "- ...",
      "🧪 Validation:",
      "- commands run + results OR why not available and what alternative check was used",
      "❓ Questions (only if needed):",
      "- options A/B with recommendation if possible",
      "⚠️ Risks/Notes:",
      "- only if relevant",
      ""
    ])
  },

  // Agents
  {
    path: ".cursor/agents/goalguard-worker.md",
    managed: true,
    content: T([
      "---",
      "name: goalguard-worker",
      "description: Executes scoped implementation tasks assigned by the Supervisor. Focuses on code-level detail; minimizes drift.",
      `${MANAGED_MARKER}`,
      "---",
      "",
      "You are GoalGuard **Worker**.",
      "",
      "## Role",
      "- Implement the Supervisor's task packet precisely.",
      "- You may read files, edit code, run commands, and debug.",
      "- You do NOT expand scope. If ambiguous, ask the Supervisor.",
      "",
      "## Execution rules",
      "- Only do the requested task.",
      "- Minimize diffs; avoid unrelated formatting/refactors.",
      "- Put heavy debug notes in `.ai/runs/GG-<task-id>.md` (not in app code).",
      "",
      "## Output format (MANDATORY)",
      "1) Summary (3–8 bullets)",
      "2) Files modified (exact paths)",
      "3) Commands run + pass/fail summary",
      "4) Risks / TODOs (if any)",
      "5) If blocked: what you need from Supervisor",
      ""
    ])
  },
  {
    path: ".cursor/agents/goalguard-verifier.md",
    managed: true,
    content: T([
      "---",
      "name: goalguard-verifier",
      "description: Read-only verifier. Checks drift and completeness vs .ai/goal.md and current diff.",
      "readonly: true",
      `${MANAGED_MARKER}`,
      "---",
      "",
      "You are GoalGuard **Verifier** (read-only).",
      "",
      "## Inputs",
      "- `.ai/goal.md`",
      "- `.ai/plan.md` (if present)",
      "- current git diff / changed files",
      "",
      "## Evaluate",
      "- Meets Definition of Done?",
      "- Drift: unrelated edits/refactors?",
      "- Missing tests/docs?",
      "- Risky behavior changes without validation?",
      "",
      "## Output format (MANDATORY)",
      "- Verdict: APPROVE / REQUEST_CHANGES / BLOCKED",
      "- Reasons (bullets)",
      "- Concrete next actions (bullets; file-level guidance)",
      ""
    ])
  },
  {
    path: ".cursor/agents/goalguard-repo-searcher.md",
    managed: true,
    content: T([
      "---",
      "name: goalguard-repo-searcher",
      "description: Read-only repo context gatherer. Finds relevant files/entry points so the Supervisor stays high-level.",
      "readonly: true",
      `${MANAGED_MARKER}`,
      "---",
      "",
      "You are GoalGuard **Repo-Searcher** (read-only).",
      "",
      "## Goal",
      "Given a query, quickly locate the most relevant parts of the repository.",
      "",
      "## Output (MANDATORY)",
      "- Summary (max 10 bullets)",
      "- Relevant files list",
      "- For each file: line ranges + why it matters",
      ""
    ])
  },

  // Commands (optional helper for Cursor slash commands)
  {
    path: ".cursor/commands/goalguard-start.md",
    managed: true,
    content: T([
      MANAGED_HTML_MARKER,
      "# /goalguard-start",
      "",
      "You are the **Supervisor** (GoalGuard protocol is always on).",
      "",
      "1) Read `.ai/goal.md` and `.ai/state.json`",
      "2) If goal is placeholder, ask the user for the real goal and update `.ai/goal.md`",
      "3) Write a short plan to `.ai/plan.md`",
      "4) Delegate first checkpoint to `goalguard-worker`",
      "5) Verify using `goalguard-verifier`",
      "6) Report to user using checkpoint update format",
      ""
    ])
  },

  // Skills (procedural memory)
  {
    path: ".cursor/skills/goalguard-supervisor/SKILL.md",
    managed: true,
    content: T([
      "---",
      "name: goalguard-supervisor",
      "description: Supervisor orchestration workflow for two-layer agent operation.",
      `${MANAGED_MARKER}`,
      "---",
      "",
      "# GoalGuard Supervisor Skill",
      "",
      "## When to use",
      "- Multi-step tasks where drift is likely.",
      "- When you want clean user communication and delegated execution.",
      "",
      "## Cadence (balanced default)",
      "- Up to 2 Worker rounds + 1 Verifier round per checkpoint, then update the user.",
      "- Interrupt early if a decision is needed or scope changes.",
      "",
      "## Memory discipline",
      "- `.ai/goal.md` is source of truth.",
      "- `.ai/plan.md` is current plan.",
      "- `.ai/task-ledger.md` is done/next/blockers.",
      "- `.ai/decisions.md` records key choices.",
      ""
    ])
  }
];
