# labali-deterministic-script-writer

Create deterministic script specifications from user task intent, so future runs can execute directly without repeated reasoning.

## Quick Usage

Minimal request:

```text
Please use $labali-deterministic-script-writer and freeze my task into a directly executable script spec without repeated reasoning.
```

Recommended request:

```text
Please use $labali-deterministic-script-writer.
Intent: <task goal>
Constraint: runtime no-reasoning, fail-fast.
Return: Preconditions, Parameters, Deterministic Steps, Step Assertions, Fail-Fast Rules, Script Skeleton.
```

## Output Shape

1. Preconditions
2. Parameters
3. Deterministic Steps
4. Step Assertions
5. Fail-Fast Rules
6. Script Skeleton (`status`, `data`, `error`)
