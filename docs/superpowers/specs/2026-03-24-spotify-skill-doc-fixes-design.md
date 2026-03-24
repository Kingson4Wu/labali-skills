# Design: labali-spotify-publish-episode Documentation Fixes

**Date:** 2026-03-24
**Scope:** Documentation-only fixes — no code changes
**Files affected:**
- `skills/public/labali-spotify-publish-episode/references/architecture.md`
- `skills/public/labali-spotify-publish-episode/SKILL.md`

---

## Problem

Three documentation inconsistencies identified by auditing against `docs/skill-reference.md` standards:

1. `architecture.md` Regeneration Protocol describes stale synchronous behavior ("in the same run") that conflicts with the actual async `pending-regen.json` mechanism now in place. The "Non-interactive mode" line is also inaccurate — the marker now persists to the next interactive run rather than being skipped.
2. `run_deterministic.ts` is missing from the Script Roles table in `architecture.md`.
3. The `MANDATORY` plan.md loading instruction in `SKILL.md` is buried mid-document (line 116, between Failure Handling and Resources), violating the skill reference standard that critical instructions belong at the top.

---

## Design

### Fix 1 — Rewrite Regeneration Protocol in `architecture.md`

**File:** `references/architecture.md`

Replace the entire Regeneration Protocol section. The section currently starts at line 64 (`## Regeneration Protocol`) and its last content line is 76 (`**Non-interactive mode:**...`), followed by a blank line (77) and `---` (78). The `---` separator on line 78 belongs to the section boundary and must be preserved.

**Find and replace this exact text** (lines 64–77 inclusive, keeping line 78 `---` untouched):

```
## Regeneration Protocol

When the deterministic cache is stale (fails) but the policy executor succeeds, the system auto-regenerates `scripts/cache/deterministic.ts` in the same run:

1. Policy executor writes a trajectory log to `.cache/spotify-publish/policy-trajectory-latest.json`
2. `auto-executor.ts` detects the deterministic failure + policy success condition
3. AI agent reads the trajectory log and the current `scripts/cache/deterministic.ts`
4. AI agent rewrites `scripts/cache/deterministic.ts` to incorporate the successful patterns
5. Next run: deterministic cache succeeds again

**Trigger condition:** deterministic attempted AND failed, policy succeeded.
**No trigger:** deterministic succeeded (no regeneration needed), or policy also failed.
**Non-interactive mode:** regeneration is skipped; guidance is logged to stdout.
```

**Replace with:**

```
## Regeneration Protocol

When the deterministic cache is stale (fails) but the policy executor succeeds:

1. Policy executor writes a trajectory log to `.cache/spotify-publish/policy-trajectory-latest.json`
2. `auto-executor.ts` writes a `.cache/spotify-publish/pending-regen.json` marker (non-blocking)
3. Publish result is returned immediately — no delay waiting for regeneration

At the **start of the next interactive run**, the startup check fires:

4. AI agent reads `pending-regen.json` (contains `trajectory_path` and `deterministic_path`)
5. AI agent reads the trajectory log and rewrites `scripts/cache/deterministic.ts`
   using role+name patterns only — no hardcoded ref keys
6. `pending-regen.json` is deleted
7. Normal publish workflow proceeds with repaired deterministic cache

**Trigger condition:** deterministic attempted AND failed, policy succeeded.
**No trigger:** deterministic succeeded (no regeneration needed), or policy also failed.
```

The "Non-interactive mode" line is intentionally removed — that behavior no longer applies; the marker simply persists to the next interactive run.

---

### Fix 2 — Add `run_deterministic.ts` to Script Roles table in `architecture.md`

**File:** `references/architecture.md`, Script Roles section (lines 118–130)

Insert a new row **after** the `scripts/run.ts`... wait — `run.ts` is not in the table. Insert after the `scripts/verifier.ts` row (line 128) and before the `tests/test_regression.sh` row (line 129):

Current table (lines 120–129):
```
| Script | Role |
|--------|------|
| `scripts/auto-executor.ts` | Unified entry |
| `scripts/cache/deterministic.ts` | Deterministic cache (generated artifact — auto-regenerated when stale) |
| `scripts/executor.ts` | Policy executor |
| `scripts/core.ts` | Shared primitives |
| `scripts/stage-detector.ts` | Stage inference |
| `scripts/publisher.ts` | Publish actions |
| `scripts/verifier.ts` | Post-publish validation |
| `tests/test_regression.sh` | Regression checks |
```

Replace with (one new row added, bold for clarity — do not bold in actual file):

```
| Script | Role |
|--------|------|
| `scripts/auto-executor.ts` | Unified entry |
| `scripts/cache/deterministic.ts` | Deterministic cache (generated artifact — auto-regenerated when stale) |
| `scripts/executor.ts` | Policy executor |
| `scripts/core.ts` | Shared primitives |
| `scripts/stage-detector.ts` | Stage inference |
| `scripts/publisher.ts` | Publish actions |
| `scripts/verifier.ts` | Post-publish validation |
| `scripts/run.ts` | CLI entry point; parses flags and invokes auto-executor |
| `scripts/run_deterministic.ts` | Direct entry point for running deterministic cache only (bypasses auto-executor) |
| `tests/test_regression.sh` | Regression checks |
```

Note: `scripts/run.ts` was also missing from the table; add it in the same pass for completeness.

---

### Fix 3 — Move MANDATORY instruction to top of SKILL.md

**File:** `SKILL.md`

**Step 1 — Remove line 116** (and its surrounding blank lines to avoid double-spacing). The exact text to find and delete is the blank line before it and the line itself:

```
(blank line at 115)
> **MANDATORY:** Before executing any UI interaction or workflow stage, load `references/plan.md` completely.
(blank line at 117)
```

After removal, lines 113–118 should read:
```
- Policy failure → repair and retry until success criteria pass

> If policy executor stage decisions are unclear, load `references/architecture.md` before proceeding.

---
```

**Step 2 — Insert** at line 22, between the architecture reference note and the `---` separator before `## Goals`. The exact insertion point:

Find this text (lines 20–25 currently):
```
This skill follows a three-layer architecture (Policy / Strategy / Execution).
See `references/architecture.md` for layer boundaries and development constraints.

---

## Goals
```

Replace with:
```
This skill follows a three-layer architecture (Policy / Strategy / Execution).
See `references/architecture.md` for layer boundaries and development constraints.

> **MANDATORY:** Before executing any UI interaction or workflow stage, load `references/plan.md` completely.

---

## Goals
```

---

## Success Criteria

- `architecture.md` Regeneration Protocol contains "pending-regen.json" and does not contain the phrases "in the same run" or "Non-interactive mode"
- Script Roles table in `architecture.md` contains a row matching `` `scripts/run_deterministic.ts` ``
- `SKILL.md` line containing `> **MANDATORY:**...load \`references/plan.md\`` appears before the first `## Goals` heading
- `SKILL.md` does not contain the MANDATORY line after the Failure Handling section
- `npm run skills:validate` passes with all skills showing PASS
- `npm run check:chinese` passes with no Chinese characters found
