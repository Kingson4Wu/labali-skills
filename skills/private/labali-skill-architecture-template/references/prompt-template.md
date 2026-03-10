# Reusable Prompt Templates

## 1) Architecture Preference Prompt

Use this as a high-level preference block when asking an agent to create a new skill.

```text
Design this skill as a layered system, not a single script.

Policy layer:
- Capture intent, constraints, success criteria, and boundaries.
- Keep policy stable and independent from fragile UI/runtime details.

Strategy layer:
- Define stage model, decision points, fallback ordering, and quality gates.
- Keep strategy decision-oriented, not implementation-heavy.

Execution layer:
- Implement replaceable scripts.
- Prefer policy executor architecture (stable orchestration + bounded semantic decisions).

Runtime requirements:
- Optional deterministic fast path first, then automatic fallback to policy baseline.
- Policy baseline must be independently reliable.
- Success must be defined by terminal business-state verification, not click success.

Interaction and recovery:
- Use role/name -> text -> label/placeholder -> bounded DOM fallback priority.
- Avoid coordinate/index driven actions.
- Apply bounded retry and explicit stage re-detection for self-healing.

Engineering guardrails:
- Validate inputs early with clear errors.
- Log stage transitions and fallback reasons.
- Return actionable diagnostics on failure.
```

## 2) New Skill Skeleton Prompt

Use this when you want generated initial files aligned with the architecture above.

```text
Create a new skill skeleton with:
1) SKILL.md (policy contract only)
2) references/architecture.md (strategy and fallback policy)
3) scripts/ folder placeholder files for executor decomposition
4) tests/ regression placeholders

Constraints:
- Keep scope task-focused and minimal.
- Use semantic interaction strategy as default.
- Include business-state verification section in SKILL.md.
- Do not include business-specific hardcoded selectors in policy docs.
```

## 3) Refactor Prompt for Existing Skill

Use this to migrate a script-heavy skill into layered architecture.

```text
Refactor this skill into policy-strategy-execution layers:
- Move stable intent and constraints into SKILL.md.
- Move workflow and fallback reasoning into references/architecture.md.
- Keep scripts modular and replaceable; add policy executor baseline if missing.
- Add terminal business-state verification and bounded retry logic.
- Preserve behavior while improving maintainability and resilience.
```
