# Design: labali-spotify-publish-episode References Cleanup

**Date:** 2026-03-24
**Scope:** `references/plan.md`, `references/architecture.md`, `SKILL.md` (Scripts section only)
**Standard:** `docs/skill-reference.md` — Token efficiency (Standard #1), single source of truth

---

## Problem Statement

After the previous SKILL.md alignment session, three issues remain:

1. **`references/plan.md` contains two sections that duplicate `architecture.md`** — `Execution Mode` and `UI Change Protocol`. These are protocol/configuration concerns, not workflow or UI pattern content. Having them in plan.md creates two sources of truth with minor wording divergences.

2. **Script inventory is fragmented across two files with different coverage** — SKILL.md lists 4 scripts (missing core.ts, stage-detector.ts, publisher.ts, verifier.ts); architecture.md lists 7 (missing tests/test_regression.sh). Neither file is authoritative.

---

## Changes

### Change 1: Remove `## Execution Mode` from `references/plan.md`

**Remove** lines 105–115 (the entire Execution Mode section):
```
## Execution Mode

**Unified Runtime Order:**
1. **Deterministic trajectory cache** (`deterministic.ts`) - optional acceleration
2. **Auto-downgrade to policy executor** (`executor.ts`) - mandatory baseline

**Configuration:**
- Set `disable_deterministic_cache=true` to skip deterministic and run policy directly
- Policy executor remains required baseline; deterministic is optional
- On policy failure: repair and retry until publish verification passes
- Log deterministic failure context; use policy-success evidence to improve deterministic mode
```

**Replace with a single pointer line:**
```
> For execution mode configuration, see `references/architecture.md` → Execution Model.
```

**Step 1a — Update architecture.md Execution Model step 4** before removing plan.md's section.

plan.md contains this detail not present in architecture.md's step 4 ("Record failures for optimization"):
> "Log deterministic failure context; use policy-success evidence to improve deterministic mode"

Update architecture.md step 4 to:
```
4. Record failures for optimization — log deterministic failure context and use policy-success evidence to improve deterministic mode.
```

**Step 1b — Remove** lines 105–115 from plan.md, replace with pointer:
```
> For execution mode configuration, see `references/architecture.md` → Execution Model.
```

**Why:** plan.md's defined purpose is "Workflow map and UI pattern hints" (per SKILL.md routing table). Execution configuration belongs in architecture.md. The logging detail in plan.md step 1a must be migrated first to prevent content loss.

---

### Change 2: Migrate procedural steps into `references/architecture.md` UI Change Protocol, then remove section from `references/plan.md`

**Step 2a — Update architecture.md UI Change Protocol** (lines 84–91).

architecture.md currently has only the change-type table. plan.md has 4 procedural steps that exist nowhere else. Before removing from plan.md, migrate those steps into architecture.md:

**Target state of the UI Change Protocol section in architecture.md after step 2a:**
```
## UI Change Protocol

When Spotify updates their UI:

1. Check if semantic goals are still achievable (SKILL.md constraints).
2. Update `references/plan.md` with new UI pattern hints.
3. Update `scripts/` with new selectors/matching logic.
4. Do NOT modify `SKILL.md` unless the fundamental workflow changes.

| Change Type | Update |
|-------------|--------|
| Text change | `references/plan.md` only |
| Element move | `scripts/*.ts` only |
| New field | `plan.md` + `scripts/` |
| Workflow restructure | All layers |
```

(The existing table rows are retained unchanged; only the 4 procedural steps are prepended.)

**Step 2b — Remove** the entire `## UI Change Protocol` section from plan.md (match by heading, not line number — line numbers shift after step 1b executes). The section begins at `## UI Change Protocol` and ends at the last row of the change-type table.

**Replace with:**
```
> For UI change protocol, see `references/architecture.md` → UI Change Protocol.
```

**Why:** The change-type table exists in both files with minor wording divergences ("Element move" vs "Element reposition", "New field" vs "New required field"). architecture.md is the authority for protocols. The 4 procedural steps in plan.md have no equivalent in architecture.md — migrating them prevents content loss before removal.

---

### Change 3: Add `tests/test_regression.sh` to `references/architecture.md` Script Roles, standardize path prefixes

**Current Script Roles table** (architecture.md lines 96–105) lists 7 scripts with bare filenames. Replace the entire table with full relative paths for consistency:

**Before:**
```
| Script | Role |
|--------|------|
| `auto-executor.ts` | Unified entry |
| `deterministic.ts` | Deterministic cache |
| `executor.ts` | Policy executor |
| `core.ts` | Shared primitives |
| `stage-detector.ts` | Stage inference |
| `publisher.ts` | Publish actions |
| `verifier.ts` | Post-publish validation |
```

**After:**
```
| Script | Role |
|--------|------|
| `scripts/auto-executor.ts` | Unified entry |
| `scripts/deterministic.ts` | Deterministic cache |
| `scripts/executor.ts` | Policy executor |
| `scripts/core.ts` | Shared primitives |
| `scripts/stage-detector.ts` | Stage inference |
| `scripts/publisher.ts` | Publish actions |
| `scripts/verifier.ts` | Post-publish validation |
| `tests/test_regression.sh` | Regression checks |
```

**Why:** architecture.md is designated as the authoritative script inventory (per Change 4 below). Adding `tests/test_regression.sh` with its subdirectory prefix while existing rows have bare names would create an inconsistent table. Standardizing to full relative paths from the skill root makes all rows unambiguous.

---

### Change 4: Simplify `SKILL.md` Scripts table to entry point + pointer

**Current Scripts sub-section** in SKILL.md lists 4 files (incomplete):
```
| `scripts/auto-executor.ts` | Unified entry point |
| `scripts/executor.ts` | Policy executor |
| `scripts/deterministic.ts` | Deterministic cache |
| `tests/test_regression.sh` | Regression checks |
```

**Replace with:**
```
| `scripts/auto-executor.ts` | Unified entry point |

For the full script inventory, see `references/architecture.md` → Script Roles.
```

**Why:** SKILL.md is the policy layer — it needs to know the entry point, not the full implementation inventory. The complete script list belongs in architecture.md (strategy layer). Keeping a partial list in SKILL.md creates the false impression it is authoritative, while actually being outdated.

---

## Files Changed

| File | Change |
|------|--------|
| `references/plan.md` | Remove Execution Mode + UI Change Protocol sections; add 2 pointer lines |
| `references/architecture.md` | Migrate Execution Model step 4 detail + migrate UI Change Protocol procedural steps + standardize Script Roles path prefixes + add test script row |
| `skills/public/labali-spotify-publish-episode/SKILL.md` | Simplify Scripts sub-section to entry point + pointer |

## Files NOT Changed

| File | Reason |
|------|--------|
| `skill.yaml` | No issues found |

---

## Success Criteria

- [ ] plan.md contains no `## Execution Mode` section
- [ ] plan.md contains no `## UI Change Protocol` section
- [ ] plan.md has pointer lines to architecture.md for both removed sections
- [ ] architecture.md Execution Model step 4 includes the logging/optimization detail
- [ ] architecture.md UI Change Protocol section includes the 4 procedural steps above the change-type table
- [ ] architecture.md Script Roles table has exactly 8 rows, all using full relative paths from skill root
- [ ] SKILL.md Scripts sub-section lists only `scripts/auto-executor.ts` with a pointer to architecture.md
- [ ] No unique content from plan.md is lost: all migrated content verifiably present in architecture.md
