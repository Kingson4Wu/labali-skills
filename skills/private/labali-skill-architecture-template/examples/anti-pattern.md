# Anti-Pattern Skill Architecture Examples

These examples show common architectural mistakes to avoid.

---

## Anti-pattern 1 — Single-script skill: no layer separation

**Structure (problematic):**

```
my-skill/
├── SKILL.md         # "Run scripts/main.py with these args"
└── scripts/
    └── main.py      # All logic: UI interaction, retry, verification, business rules
```

**Problems:**
- `SKILL.md` is just a script invocation wrapper — it provides no policy value
- When the UI changes, there is no stable policy to fall back on
- The script cannot be replaced without losing all business logic
- No strategy layer means no documented fallback order, no stage model, no known edge cases
- Claude has no way to repair execution failures because the policy is silent on recovery

**Fixed structure:**
- `SKILL.md`: define the goal, constraints, and success criteria (not the script path)
- `references/architecture.md`: define the stage model and fallback order
- `scripts/main.py`: implement the execution, replaceable if the UI changes

---

## Anti-pattern 2 — Implementation details in policy layer

**Problematic `SKILL.md`:**

```markdown
## Execution

1. Navigate to `https://creators.spotify.com/pod/show/<show_id>/episodes`.
2. Click the button with CSS selector `button[data-testid="episode-menu-btn"]`.
3. Select the menu item with text "Delete episode".
4. Confirm the dialog by clicking `button.confirm-delete`.
5. Verify by checking that `div.episode-row[data-status="draft"]` count decreased by 1.
```

**Problems:**
- CSS selectors and specific URLs belong in the execution layer, not the policy
- When Spotify changes their DOM (which they will), `SKILL.md` becomes wrong and must be updated
- Policy should describe *what* to do and *how to verify*, not *which DOM node to click*
- A future implementation using a different browser driver cannot use these selectors

**Fixed version in `SKILL.md`:**
```markdown
## Required Constraints

- Use semantic interactions: find the episode menu by its visible role and label.
- Deletion success is confirmed by business state: the Draft count decreases.
- Scope all actions to Draft episodes only.
```

Move selector details and URL patterns to `scripts/` where they belong.

---

## Anti-pattern 3 — Vague or missing success criteria

**Problematic:**

```markdown
## Success Criteria

The skill runs successfully when the task is completed without errors.
```

**Problems:**
- "Completed without errors" means "the script exited 0" — this is action success, not business success
- A script can exit 0 and still leave the system in a wrong state (episode still in Draft, file not written, etc.)
- No way to verify correctness after the fact
- Claude cannot determine when to retry vs. when to declare success

**Fixed version:**

```markdown
## Success Criteria

A run is successful only when all conditions hold:

1. The target episode no longer appears in the Draft list.
2. The episode appears in either the Published or Scheduled list.
3. Script exit code is 0.
```

Condition 3 alone is insufficient; conditions 1 and 2 are the actual success signal.

---

## Anti-pattern 4 — Strategy layer that is just a copy of the policy

**Problematic `references/architecture.md`:**

```markdown
# Architecture

This skill publishes episodes on Spotify.

It uses browser automation. The user must be logged in.
The skill handles scheduling and immediate publishing.
```

**Problems:**
- This is a restatement of `SKILL.md`, not a strategy
- No stage model, no fallback order, no decision points documented
- A Claude agent reading this gains nothing beyond what `SKILL.md` already said
- When execution fails at an intermediate stage, there is no recovery guidance

**Fixed version:** the strategy layer should answer: *what are the stages?*, *what triggers each stage transition?*, *what do we do when a stage fails?*, *what are the known variant paths?*

---

## Anti-pattern 5 — Policy skill that has an unnecessary executor

**Problematic structure for a writing-style skill:**

```
labali-blog-writing-style/
├── SKILL.md
└── scripts/
    └── run.py    # Calls Claude API to do the writing
```

**Problems:**
- The skill's job IS Claude reasoning — wrapping it in a subprocess that calls another LLM adds latency and complexity with no benefit
- Policy-only skills should execute directly through the AI agent, not through a subprocess
- If you need a script to call an LLM, you have inverted the skill architecture

**Correct pattern:** mark the skill as `type: policy-only` in `skill.yaml`, omit `scripts/`, and let the AI agent execute the policy directly.
