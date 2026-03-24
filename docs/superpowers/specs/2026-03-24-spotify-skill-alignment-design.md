# Design: labali-spotify-publish-episode SKILL.md Deep Alignment

**Date:** 2026-03-24
**Scope:** `skills/public/labali-spotify-publish-episode/SKILL.md` only
**Standard:** `docs/skill-reference.md` — 6 Core Standards

---

## Problem Statement

The current SKILL.md has five gaps when measured against `docs/skill-reference.md`:

1. **Weak trigger phrases in description** — missing common user phrasings like "release episode", "upload podcast", "spotify creator"
2. **No loading trigger for `references/plan.md`** — listed in Resources table but never instructed to load
3. **Weak loading trigger for `references/architecture.md`** — conditional on uncertainty ("if unclear"), easy to skip
4. **Layer Contract duplication** — full table duplicated from architecture.md, wastes tokens with no added value
5. **Incomplete NEVER list** — only covers publish verification; missing semantic interaction constraints

---

## Changes

### 1. YAML `description` — add trigger phrases

**Before:**
```
description: Publish podcast episodes on Spotify for Creators using browser-only semantic automation with manual-login session reuse. Use when you need to publish, upload, or schedule a new podcast episode on Spotify for Creators via browser automation.
```

**After:**
```
description: Publish podcast episodes on Spotify for Creators using browser-only semantic automation with manual-login session reuse. Use when asked to publish, upload, release, or schedule a podcast episode on Spotify for Creators (creators.spotify.com). Trigger phrases: "publish episode", "upload podcast", "release episode", "schedule podcast", "spotify creator".
```

**Why:** `description` is the only always-in-memory layer. Richer trigger phrases improve activation reliability without token cost at runtime.

---

### 2. Layer Contract — remove duplication, replace with pointer

**Before:** Full 4-row table (Layer / File / Purpose) duplicating architecture.md.

**After:**
```
This skill follows a three-layer architecture (Policy / Strategy / Execution).
See `references/architecture.md` for layer boundaries and development constraints.
```

**Why:** architecture.md is the authoritative source. Duplicate tables drift and waste tokens (Standard #1).

---

### 3. Resources table → Routing Table

**Before:** Flat file list with description column only — six entries covering both `references/` files and `scripts/*.ts` + `tests/` files.

**After:** Split into two sub-sections:

**Reference Loading (replaces `references/` rows only):**

| Scenario | Must load | Do NOT load |
|----------|-----------|-------------|
| Policy executor stage unclear | `references/architecture.md` | `references/plan.md` |
| UI interaction / workflow steps | `references/plan.md` | `references/architecture.md` |
| UI change or selector update | `references/plan.md` | — |
| Script development / layer boundaries | `references/architecture.md` | `references/plan.md` |

**Scripts (retains existing rows for scripts and tests):**

| File | Purpose |
|------|---------|
| `scripts/auto-executor.ts` | Unified entry point |
| `scripts/executor.ts` | Policy executor |
| `scripts/deterministic.ts` | Deterministic cache |
| `tests/test_regression.sh` | Regression checks |

**Why:** Routing table (skill-reference.md Technique 2) prevents both under-loading and over-loading. Currently `plan.md` is never loaded because there is no instruction to do so. Script rows are preserved separately so no resource entries are lost.

---

### 4. Operational Mode — embed MANDATORY load instruction

Add at the end of the Operational Mode section:

```
> **MANDATORY:** Before executing any UI interaction or workflow stage, load `references/plan.md` completely.
```

**Why:** Agents won't load references automatically (skill-reference.md Standard #6). The instruction must be embedded at the decision point, not only in a table. The instruction is scoped to "UI interaction or workflow stages" (not script development or layer boundary work) to stay consistent with the routing table in Change 3.

---

### 5. NEVER list — add 2 interaction constraints

**Add:**
- Never use static coordinates, positional indexes, or DOM structure assumptions for interaction.
- Never report a stage as complete based on click success alone — always validate by observable state change.

**Why:** The existing 3 items only cover publish verification. These two additions are policy-level constraints about intent and verification approach — they belong in the NEVER list as non-negotiable floors (Standard #3). Note: "Never reference CSS selectors/XPath in SKILL.md" was considered but rejected — it is a meta-authoring constraint already covered by `references/architecture.md`'s Layer Contract; adding it to SKILL.md itself would be circular.

---

## Files Changed

| File | Change type |
|------|-------------|
| `skills/public/labali-spotify-publish-episode/SKILL.md` | Edit (5 targeted changes) |

## Files NOT Changed

| File | Reason |
|------|--------|
| `references/plan.md` | Out of scope (Approach B) |
| `references/architecture.md` | Out of scope (Approach B) |
| `skill.yaml` | No issues found |

---

## Success Criteria

- [ ] `description` contains at least 5 distinct trigger phrases
- [ ] `description` field is ≤ 1024 characters
- [ ] Layer Contract duplication removed from SKILL.md
- [ ] Routing table present with at least 4 scenarios, scoped to `references/` files only
- [ ] All 4 existing script/test resource entries are retained in a Scripts sub-section
- [ ] MANDATORY load instruction embedded in Operational Mode section, scoped to "UI interaction or workflow stages"
- [ ] NEVER list has at least 5 items (3 original + 2 new) covering both publish verification and interaction constraints
