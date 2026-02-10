#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const TIMEOUT_MS = Number(process.env.GOALGUARD_PROTOCOL_TIMEOUT_MS || 30000);
const SKIP_OK = process.env.GOALGUARD_PROTOCOL_SKIP_OK === "1"; // missing CLI/auth => exit 0
const EXPLICIT_MODEL = process.env.GOALGUARD_PROTOCOL_MODEL || ""; // e.g. composer-1.5
const RULES_MARKER = "GOALGUARD_PROTOCOL_RULES_LOADED_6b3d1c9b2a7e4f3c"; // unlikely to occur accidentally

async function run(cmd, args, { cwd, timeoutMs }) {
  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, timedOut, error: err });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, error: null });
    });
  });
}

async function canRun(cmd, args) {
  const r = await run(cmd, args, { cwd: process.cwd(), timeoutMs: 2000 });
  if (r?.error?.code === "ENOENT") return false;
  return true;
}

async function detectAgentCommand() {
  const candidates = [
    { cmd: "cursor", prefix: ["agent"] },
    { cmd: "agent", prefix: [] },
    { cmd: "cursor-agent", prefix: [] }
  ];

  for (const c of candidates) {
    if (await canRun(c.cmd, [...c.prefix, "--help"])) return c;
  }
  return null;
}

function extractText(stdout) {
  const s = String(stdout || "").trim();
  // Some Cursor outputs are JSON objects with "result"
  if (s.startsWith("{") && s.includes('"result"')) {
    try {
      const obj = JSON.parse(s);
      if (typeof obj?.result === "string") return obj.result;
    } catch {
      // fall through
    }
  }
  return String(stdout || "");
}

function looksLikeAuthError(s) {
  return /Authentication required/i.test(s) || /\bNot logged in\b/i.test(s) || /cursor agent login/i.test(s);
}

function looksLikeUsageLimit(s) {
  return /\bhit your usage limit\b/i.test(s) || /\busage limits will reset\b/i.test(s);
}

function looksLikeModelNotAllowed(s) {
  return /Cannot use this model:/i.test(s);
}

function assertCheckpointFormat(text) {
  // Be strict about the sections, but allow minor formatting variance:
  // - emoji optional
  // - bold optional
  // - colon optional (some models emit `**Completed**` instead of `✅ Completed:`)
  const must = [
    /^\*\*Checkpoint:\*\*/m,
    /^(?:✅\s*)?(?:\*\*Completed:?\*\*:?|Completed:?)/m,
    /^(?:🔜\s*)?(?:\*\*Next:?\*\*:?|Next:?)/m,
    /^(?:🧪\s*)?(?:\*\*Validation:?\*\*:?|Validation:?)/m
  ];
  for (const re of must) {
    if (!re.test(text)) {
      const preview = String(text || "").slice(0, 2000);
      throw new Error(
        `Protocol output missing required section: ${String(re)}\n\n--- output (first 2000 chars) ---\n${preview}\n--- end output ---`
      );
    }
  }
}

function assertRulesLoaded(text) {
  if (String(text || "").includes(RULES_MARKER)) return;
  const preview = String(text || "").slice(0, 2000);
  throw new Error(
    `[GoalGuard protocol test] Expected rules marker not found (Cursor CLI may not be loading .cursor/rules).\n\n` +
      `Missing token:\n${RULES_MARKER}\n\n--- output (first 2000 chars) ---\n${preview}\n--- end output ---`
  );
}

async function main() {
  const agent = await detectAgentCommand();
  if (!agent) {
    const msg = "[GoalGuard protocol test] Cursor CLI not found (expected one of: cursor, agent, cursor-agent).";
    if (SKIP_OK) {
      console.warn(msg, "Skipping (GOALGUARD_PROTOCOL_SKIP_OK=1).");
      return;
    }
    throw new Error(msg);
  }

  // temp workspace
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "goalguard-protocol-"));
  await fs.writeFile(path.join(tmp, "README.md"), "# Protocol Test Workspace\n", "utf8");

  // initialize GoalGuard files headlessly
  const initRes = await run(
    "node",
    ["scripts/goalguard-init.mjs", "--workspace", tmp, "--force"],
    { cwd: path.resolve("."), timeoutMs: 10000 }
  );
  if (initRes.code !== 0) {
    throw new Error(`goalguard-init failed: ${initRes.stderr || initRes.stdout}`);
  }

  // Make goal.md non-placeholder so Supervisor has something real to anchor to
  const goal = [
    "# Goal Contract (single source of truth)",
    "",
    "## Objective",
    "- Produce a single checkpoint update in the required format. Do not edit files. Do not run commands.",
    "",
    "## Definition of Done",
    "- [ ] Output includes **Checkpoint:**, ✅ Completed, 🔜 Next, 🧪 Validation",
    "",
    "## Constraints",
    "- No scope creep",
    "- No code changes",
    ""
  ].join("\n") + "\n";
  await fs.writeFile(path.join(tmp, ".ai", "goal.md"), goal, "utf8");

  // Marker rule: proves the CLI is actually loading `.cursor/rules` without the prompt having to mention it.
  const markerRule = [
    "---",
    "description: GoalGuard protocol test marker (verifies Cursor CLI loads .cursor/rules).",
    "alwaysApply: true",
    "---",
    "",
    "# GoalGuard Protocol Marker",
    "",
    "In your next response, you MUST include this exact token as a bullet under the Validation section:",
    `- ${RULES_MARKER}`,
    "",
    "Do not explain why.",
    ""
  ].join("\n");
  await fs.writeFile(path.join(tmp, ".cursor", "rules", "999-goalguard-protocol-marker.mdc"), markerRule, "utf8");

  const prompt = [
    "Read .ai/goal.md and output ONLY one checkpoint update in the required format.",
    "Do not modify any files. Do not run any commands.",
    ""
  ].join("\n");

  let out = null;
  let authErr = null;
  let usageErr = null;
  let lastErr = null;
  let usedModel = "";

  // Default model preference: pick a model that is usually available even when premium usage is capped.
  const modelCandidates = EXPLICIT_MODEL
    ? [EXPLICIT_MODEL]
    : [
        "composer-1.5",
        "composer-1",
        "gpt-5.3-codex-fast",
        "sonnet-4.5",
        "auto"
      ];

  const buildPrintAttempts = (model) => [
    [...agent.prefix, "--workspace", tmp, "--model", model, "-p", "--output-format", "text", prompt],
    [...agent.prefix, "--workspace", tmp, "--model", model, "--print", "--output-format", "text", prompt],
    [...agent.prefix, "--workspace", tmp, "--model", model, "-p", prompt],
    [...agent.prefix, "--workspace", tmp, "--model", model, "--print", prompt],
    [...agent.prefix, "--workspace", tmp, "--model", model, "chat", "-p", "--output-format", "text", prompt],
    [...agent.prefix, "--workspace", tmp, "--model", model, "chat", "--print", "--output-format", "text", prompt],
    [...agent.prefix, "--workspace", tmp, "--model", model, "chat", "-p", prompt],
    [...agent.prefix, "--workspace", tmp, "--model", model, "chat", "--print", prompt]
  ];

  const buildFallbackAttempts = (model) => [
    [...agent.prefix, "--workspace", tmp, "--model", model, prompt],
    [...agent.prefix, "--workspace", tmp, "--model", model, "chat", prompt]
  ];

  for (const model of modelCandidates) {
    // Attempt PRINT mode first (we enforce timeout since -p/--print has had hanging regressions).
    for (const args of buildPrintAttempts(model)) {
      const r = await run(agent.cmd, args, { cwd: tmp, timeoutMs: TIMEOUT_MS });
      if (!r.timedOut && r.code === 0 && String(r.stdout || "").trim().length > 0) {
        out = extractText(r.stdout);
        usedModel = model;
        break;
      }
      const combined = `${r.stderr || ""}\n${r.stdout || ""}`.trim();
      if (combined && looksLikeAuthError(combined)) {
        authErr = combined;
        break;
      }
      if (combined && looksLikeUsageLimit(combined)) {
        usageErr = combined;
        lastErr = combined;
        break; // try next model
      }
      if (combined && looksLikeModelNotAllowed(combined)) {
        lastErr = combined;
        break; // try next model
      }
      if (!r.timedOut && combined) lastErr = combined;
    }

    if (out || authErr) break;

    // Fallback: non-print mode (prompt forbids tool use).
    for (const args of buildFallbackAttempts(model)) {
      const r = await run(agent.cmd, args, { cwd: tmp, timeoutMs: TIMEOUT_MS });
      if (!r.timedOut && r.code === 0 && String(r.stdout || "").trim().length > 0) {
        out = extractText(r.stdout);
        usedModel = model;
        break;
      }
      const combined = `${r.stderr || ""}\n${r.stdout || ""}`.trim();
      if (combined && looksLikeAuthError(combined)) {
        authErr = combined;
        break;
      }
      if (combined && looksLikeUsageLimit(combined)) {
        usageErr = combined;
        lastErr = combined;
        break; // try next model
      }
      if (combined && looksLikeModelNotAllowed(combined)) {
        lastErr = combined;
        break; // try next model
      }
      if (!r.timedOut && combined) lastErr = combined;
    }

    if (out || authErr) break;
  }

  if (!out) {
    if (authErr) {
      const msg =
        "[GoalGuard protocol test] Authentication required for Cursor CLI.\n\n" +
        "Fix:\n" +
        "- Run: cursor agent login (or: NO_OPEN_BROWSER=1 cursor agent login)\n" +
        "- Or set CURSOR_API_KEY in env and re-run.\n\n" +
        `CLI said:\n${authErr.trim()}\n`;
      if (SKIP_OK) {
        console.warn(msg.trim());
        return;
      }
      throw new Error(msg.trim());
    }
    if (usageErr) {
      const msg =
        "[GoalGuard protocol test] Cursor model usage limit reached for the selected model(s).\n\n" +
        "Fix:\n" +
        "- Try a different model (recommended for CI): GOALGUARD_PROTOCOL_MODEL=composer-1.5\n" +
        "- Or enable a Spend Limit in Cursor, or wait for the monthly reset.\n\n" +
        `CLI said:\n${usageErr.trim()}\n`;
      if (SKIP_OK) {
        console.warn(msg.trim());
        return;
      }
      throw new Error(msg.trim());
    }
    if (SKIP_OK) {
      console.warn(
        "[GoalGuard protocol test] Skipping: no usable output received (timed out or CLI failed)."
      );
      if (lastErr) console.warn(`Last error output:\n${lastErr.trim()}`);
      return;
    }
    throw new Error(
      `[GoalGuard protocol test] No output received (timed out or CLI failed). cmd=${agent.cmd} prefix=${agent.prefix.join(" ")}\n` +
        (lastErr ? `Last error output:\n${lastErr.trim()}` : "")
    );
  }

  assertRulesLoaded(out);
  assertCheckpointFormat(out);
  console.log(`[GoalGuard protocol test] PASS (model=${usedModel || "unknown"})`);
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
