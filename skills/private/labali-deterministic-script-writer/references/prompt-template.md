# Prompt Templates

## 1) One-Line User Request (Minimal)

```text
Please freeze my task into a script that can run directly next time, without repeated reasoning.
```

## 2) Recommended Explicit Request

```text
Please use $labali-deterministic-script-writer.
Intent: <my task goal>
Constraint: runtime no-reasoning, fail-fast, no candidate retries.

Output format must include:
1) Preconditions
2) Parameters
3) Deterministic Steps
4) Step Assertions
5) Fail-Fast Rules
6) Script Skeleton with {status, data, error}
```

## 3) Multi-Source Context Request

```text
Please use $labali-deterministic-script-writer.
My task may come from multiple skills and dynamic reasoning.
Do not bind to one source skill.
Extract one deterministic executable spec centered on this intent: <intent>.
```
