# Design: Deterministic Cache Folder Restructure + AI-Driven Auto-Regeneration

**Date:** 2026-03-24
**Scope:** `scripts/`, `references/architecture.md`, `references/plan.md`, `SKILL.md`
**Goal:** Realign implementation and documentation with the original architectural intent: policy executor is the adaptive AI core; deterministic.ts is a generated acceleration cache that auto-corrects itself when stale.

---

## Architectural Intent (Clarified)

The original design is:

| Layer | Role | Nature |
|-------|------|--------|
| **Policy Executor** (`executor.ts`) | Adaptive AI core — handles UI changes through semantic reasoning | Stable, rarely changed |
| **Deterministic Cache** (`deterministic.ts`) | Primary fast path — hardcoded sequence from a prior successful run | Generated artifact, auto-regenerated when stale |

**Runtime flow:**
1. Try deterministic cache first (fast, no AI reasoning needed)
2. If it fails → fall back to policy executor (AI-driven, always works)
3. If deterministic failed AND policy succeeded → auto-regenerate deterministic.ts in the same run

This is a self-healing acceleration pattern. Policy is the source of truth; deterministic is its cached form.

---

## Changes

### Change 1: Move `deterministic.ts` to `scripts/cache/`

**Current:** `scripts/deterministic.ts`
**After:** `scripts/cache/deterministic.ts`

Update import in `auto-executor.ts`:
```ts
// Before
import { executeDeterministic } from "./deterministic";

// After
import { executeDeterministic } from "./cache/deterministic";
```

`scripts/cache/deterministic.ts` is committed to the repository (not gitignored) so that the cached fast path survives clones. Its presence signals "this is a generated artifact" via its location.

Also update import in `scripts/run_deterministic.ts`:
```ts
// Before
import { executeDeterministic } from "./deterministic";

// After
import { executeDeterministic } from "./cache/deterministic";
```

`run_deterministic.ts` is the direct-run CLI entrypoint and also imports `deterministic.ts` directly.

---

### Change 2: Add policy trajectory logging to `executor.ts`

When policy executor completes successfully, write a structured JSON snapshot to:
```
.cache/spotify-publish/policy-trajectory-latest.json
```

This file is a **single JSON object** (overwrite on each successful run, not appended). Format:
```json
{
  "timestamp": "2026-03-24T10:00:00Z",
  "show_id": "abc123",          // optional — omitted if not provided by caller; use show_name or show_home_url as fallback label
  "stages": [
    {
      "stage": "auth",
      "action": "navigate",
      "detail": "Opened creators.spotify.com, session reused"
    },
    {
      "stage": "upload",
      "action": "uploadBySemanticCandidates",
      "candidates_tried": ["Upload audio", "Episode file"],
      "candidate_matched": "Upload audio"
    },
    {
      "stage": "metadata",
      "action": "fillTitle",
      "ref_role": "textbox",
      "ref_name": "Title",
      "method": "nativeType"
    },
    {
      "stage": "metadata",
      "action": "fillDescription",
      "ref_role": "textbox",
      "ref_name": "",
      "method": "nativeType",
      "fallback_used": false
    },
    {
      "stage": "navigation",
      "action": "clickNext",
      "label_matched": "Next",
      "iterations": 2
    },
    {
      "stage": "publish",
      "action": "publishNow",
      "method": "clickRoleByNames",
      "label_matched": "Publish episode"
    },
    {
      "stage": "verify",
      "action": "verifyPublishedInList",
      "result": "success"
    }
  ],
  "refs_snapshot": {
    // INFORMATIONAL ONLY — ref keys are ephemeral and session-scoped.
    // The AI regenerator must NOT hardcode these keys in deterministic.ts.
    // Use only to understand which semantic role+name patterns were matched.
    "title_ref_role": "textbox",
    "title_ref_name": "Title",
    "description_ref_role": "textbox",
    "description_ref_name": ""
  },
  "fallbacks_used": [],
  "publish_mode": "immediate"
}
```

`.json` suffix is correct — this is a single structured object, not a line-delimited log. The existing `deterministic-policy-fallback-history.jsonl` remains unchanged (that is the multi-run history log).

---

### Change 3: Replace `promptOptimizationSuggestion` with auto-regeneration

**Trigger condition** (already correct in current code):
```ts
if (deterministicAttempted && !deterministicSuccess && deterministicError) {
  await autoRegenerateDeterministic(deterministicError, skillRoot, context.prompt);
}
```

Where `skillRoot` is a module-level constant in `auto-executor.ts`:
```ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
```

Only fires when deterministic failed AND policy succeeded (reaching this code means policy succeeded).

**Pre-requisite fix: export `PromptFn` from `core.ts`**

`auto-executor.ts` already imports `PromptFn` from `./core`, but `core.ts` does not export it — this is a pre-existing compile error. Fix by adding to `core.ts`:
```ts
export type PromptFn = (message: string) => Promise<void>;
```
And update `ExecutorContext.prompt` to use it:
```ts
prompt?: PromptFn;
```
Add `core.ts` to Files Changed.

**New `autoRegenerateDeterministic()` function in `auto-executor.ts`:**

The `prompt()` callback returns `Promise<void>` (fire-and-forget). After `await prompt(message)` resolves, the AI agent has received the instruction and will act on it — but there is no synchronous confirmation that `deterministic.ts` was actually written. This is acceptable: the rewrite happens in the same interactive session, and the next run of the skill will validate whether it succeeded. The function must not throw or block on confirmation.

```ts
async function autoRegenerateDeterministic(
  deterministicError: string,
  skillRoot: string,            // absolute path to skill root, passed from auto-executor
  prompt: PromptFn | undefined
): Promise<void> {
  const trajectoryPath = resolve(skillRoot, ".cache/spotify-publish/policy-trajectory-latest.json");
  const deterministicPath = resolve(skillRoot, "scripts/cache/deterministic.ts");

  if (!prompt) {
    // Non-interactive mode: log guidance only, cannot rewrite
    console.log(`[auto-regen] Deterministic failed: ${deterministicError}`);
    console.log(`[auto-regen] Policy succeeded. Trajectory saved to: ${trajectoryPath}`);
    console.log(`[auto-regen] Run interactively to trigger automatic deterministic regeneration.`);
    return;
  }

  const message = `Deterministic cache failed with: ${deterministicError}

Policy executor succeeded. The successful execution trajectory has been saved to:
  ${trajectoryPath}

Please immediately perform the following steps without asking for confirmation:
1. Read ${trajectoryPath} (the successful policy trajectory)
2. Read ${deterministicPath} (the current stale deterministic implementation)
3. Rewrite ${deterministicPath} to fix the failure, incorporating the patterns from the successful policy trajectory
4. The refs_snapshot in the trajectory is informational only — do NOT hardcode ref keys; use the role+name patterns instead
5. Ensure the rewritten file preserves the same function signature: export async function executeDeterministic(inputs, context)

Apply the fix now. No confirmation needed.`;

  await prompt(message);
  // Fire-and-forget: prompt returns void. The AI agent acts on the instruction
  // asynchronously within the same session. Validation occurs on the next run.
}
```

**Graceful degradation when `prompt` is undefined:** logs guidance to stdout only, does not block the run. The task has already completed successfully via policy; regeneration is a bonus step.

---

### Change 4: Update `references/architecture.md` labels and add Regeneration Protocol

**Change the Execution Model diagram labels only** (order stays the same — deterministic runs first):

**Before:**
```
Deterministic Cache → Policy Executor → Repair & Retry
     (optional)      (mandatory baseline)   (in-loop)
```

**After:**
```
Deterministic Cache → Policy Executor → Repair & Retry
  (primary fast path)  (adaptive fallback)   (in-loop)
```

**Add a new section after Execution Model:**

```markdown
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

**Also update Script Roles table** to reflect the new path and add a note:

```markdown
| `scripts/cache/deterministic.ts` | Deterministic cache (generated artifact — auto-regenerated when stale) |
```

---

### Change 5: Update `SKILL.md` Operational Mode description

**Current:**
```
> If policy executor stage decisions are unclear, load `references/architecture.md` before proceeding.
> **MANDATORY:** Before executing any UI interaction or workflow stage, load `references/plan.md` completely.
```

No change to these lines. But add a clarifying note to the Operational Mode table:

**Current table:**
```
| **Default (unified)** | Deterministic cache → policy executor fallback |
| **Policy-only** | Set `disable_deterministic_cache=true` |
```

**After (add note below table):**
```
Deterministic cache runs first as the primary fast path. If it fails, policy executor takes over.
When deterministic fails and policy succeeds, the cache is automatically regenerated in the same run.
```

---

## Files Changed

| File | Change |
|------|--------|
| `scripts/deterministic.ts` | Move to `scripts/cache/deterministic.ts` |
| `scripts/auto-executor.ts` | Update import path; replace `promptOptimizationSuggestion` with `autoRegenerateDeterministic`; add module-level `skillRoot` derivation |
| `scripts/run_deterministic.ts` | Update import path from `./deterministic` to `./cache/deterministic` |
| `scripts/executor.ts` | Add trajectory logging on success — write `.cache/spotify-publish/policy-trajectory-latest.json` internally before returning |
| `scripts/core.ts` | Export `PromptFn` type; update `ExecutorContext.prompt` to use it |
| `references/architecture.md` | Fix Execution Model labels; add Regeneration Protocol section; update Script Roles path |
| `SKILL.md` | Add clarifying note to Operational Mode section |

## Files NOT Changed

| File | Reason |
|------|--------|
| `references/plan.md` | No relevant content |
| `skill.yaml` | No changes needed |

## Runtime Artifacts (not committed)

`.cache/spotify-publish/policy-trajectory-latest.json` is written at runtime by `executor.ts` and should be added to `.gitignore` to prevent accidental commits. The existing `.cache/` directory is already a runtime artifact location.

---

## Success Criteria

- [ ] `scripts/cache/deterministic.ts` exists; `scripts/deterministic.ts` is removed
- [ ] `auto-executor.ts` imports from `./cache/deterministic`
- [ ] `run_deterministic.ts` imports from `./cache/deterministic`
- [ ] `core.ts` exports `PromptFn` type; `ExecutorContext.prompt` uses it
- [ ] `autoRegenerateDeterministic()` replaces `promptOptimizationSuggestion()`; accepts `skillRoot` parameter
- [ ] Prompt message in `autoRegenerateDeterministic()` uses absolute paths derived from `skillRoot`
- [ ] Graceful degradation when `prompt` is undefined (logs only, does not throw)
- [ ] `executor.ts` writes `.cache/spotify-publish/policy-trajectory-latest.json` on success
- [ ] Trajectory file is valid JSON (single object, not JSONL)
- [ ] `refs_snapshot` in trajectory contains role+name pairs only (no ephemeral ref keys)
- [ ] architecture.md Execution Model labels updated to "primary fast path" / "adaptive fallback"
- [ ] architecture.md has a new "Regeneration Protocol" section
- [ ] architecture.md Script Roles table references `scripts/cache/deterministic.ts`
- [ ] SKILL.md Operational Mode has the clarifying note
