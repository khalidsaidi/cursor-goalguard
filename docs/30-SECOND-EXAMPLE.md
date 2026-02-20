# 30‑second example: what you see and how the two layers work

**Scenario:** “Add a dark mode toggle to my React app (no big refactors)”

---

## User → Supervisor (main Cursor Agent chat)

**User:**  
“Add a dark mode toggle to my React app. Keep changes small. Done = toggle persists and basic pages look correct.”

**Supervisor:**  
“Got it. Two quick questions so I don’t guess:

- Do you already use Tailwind / CSS variables / a theme library?
- Persist preference in localStorage or follow system theme by default?

While you answer, I’ll create a Goal Contract and plan.”

---

## Supervisor (writes files)

- **Updates `.ai/goal.md`** — objective + DoD + constraints  
- **Updates `.ai/plan.md`** — Checkpoint 1: find styling approach; Checkpoint 2: implement toggle + persistence; Checkpoint 3: verify  

---

## Supervisor → Repo‑Searcher (internal, subagent)

**Supervisor:**  
“Find how theming/styling works. Look for Tailwind config, CSS vars, theme provider, and where layout/header lives.”

**Repo‑Searcher → Supervisor (internal result):**  
- Uses Tailwind with `dark:` variants; `tailwind.config.js` has `darkMode: 'class'`…  
- Header component: `src/components/Header.tsx`…  
- Root: `src/main.tsx`…  

---

## Supervisor → Worker (internal task packet, subagent)

- **Task ID:** GG-dark-01  
- **Mission excerpt:** “Add dark mode toggle… persists… minimal changes…”  
- **Task:** “Implement theme toggle using Tailwind dark class on `<html>` or `<body>`, add a toggle in Header, persist in localStorage.”  
- **Scope:** Allowed `src/**`, Tailwind config if needed. Do not touch unrelated components.  
- **Acceptance:** Toggle works, persists, no refactor.  
- **Validation:** `npm test` (if exists), `npm run build`, quick manual check notes.  

**Worker → Supervisor (internal result):**  
- **Summary:**  
  - Added `useTheme` hook that reads/writes localStorage  
  - Toggles `document.documentElement.classList.toggle('dark')`  
  - Added a toggle button in `Header.tsx`  
- **Files changed:**  
  - `src/hooks/useTheme.ts`  
  - `src/components/Header.tsx`  
  - `src/main.tsx` (initialize theme on load)  
- **Commands:** `npm run build` ✅  
- **Notes:** No UI library used; minimal diff.  

---

## Supervisor → Verifier (internal, subagent)

**Supervisor:**  
“Check diff vs `.ai/goal.md`: drift? missing docs/tests? any risky changes?”

**Verifier → Supervisor (internal result):**  
- **Verdict:** APPROVE  
- No unrelated edits  
- Meets DoD (toggle + persistence)  
- **Suggest:** Add 2 lines to README “Theme toggle uses localStorage key X” (optional)  

---

## Supervisor → User (checkpoint update)

**Checkpoint: Dark mode toggle implemented**

- ✅ **Completed:**  
  - Added a Header toggle that switches Tailwind dark mode (adds/removes `dark` class)  
  - Persists preference in localStorage  
- 🔜 **Next:**  
  - Quick manual verify on main pages + optional README note  
- 🧪 **Validation:**  
  - `npm run build` passed  
- ❓ **Questions (only if needed):**  
  - Should default follow system theme when no preference is set, or default to light?  
- ⚠️ **Risks/Notes:**  
  - None (minimal diff, scoped changes)  

---

## What this shows (in plain terms)

- **You only talked to the Supervisor.**  
- The Supervisor ran a small internal loop with a **Worker** (implementation) and a **Verifier** (review).  
- The Supervisor then reported back with a clean update, without dumping messy debug output on you.  
- The “why” stayed stable because it was anchored in `.ai/goal.md`.
