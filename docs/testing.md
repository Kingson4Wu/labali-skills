# Testing and Regression

Reference this document when writing or running skill tests.

## Test Requirements by Execution Type

| Skill type | Minimum | Recommended |
|-----------|---------|-------------|
| `browser` | `tests/test_regression.sh` covering happy path + fallback | Integration tests with real browser session |
| `cli` | Unit tests for core logic | `tests/cases.yaml` for input/output pairs |
| `policy` | Trigger tests (should/should-not activate) | Functional consistency across 3–5 runs |
| `hybrid` | Unit tests for scripts | End-to-end integration tests |

## Test File Conventions

Place all test files under `tests/` in the skill root.

```
tests/
├── test_regression.sh    # Shell-based regression suite
├── cases.yaml            # Declarative input/output test cases (optional)
└── fixtures/             # Sample inputs, expected outputs (optional)
```

## What to Test

### Trigger Tests (all skill types)

Verify the skill activates on the right requests:

- **Should trigger**: direct phrasing, paraphrased requests, synonyms
- **Should NOT trigger**: clearly unrelated topics

Debug tip: ask Claude "When would you use the [skill name] skill?" — adjust the `description` field based on what it quotes back.

### Functional Tests (all skill types)

Run the same task 3–5 times and verify:

- **Structural consistency**: same output shape each run
- **Quality stability**: no major variation across runs
- **Critical path coverage**: happy path and at least one fallback branch

### Script Tests (`cli`, `browser`, `hybrid`)

For skills with executable scripts:

- Key execution paths (happy path)
- Fallback branches (when the primary path fails)
- Edge cases in input parsing and validation
- Historically regression-prone scenarios — add a test every time a bug is fixed

## Regression Evaluation

When modifying prompt logic or script behavior:

1. Identify must-pass cases from existing tests
2. Run them before the change (baseline)
3. Apply the change
4. Run the same cases — all must-pass cases must still pass
5. Compare outputs for behavioral regressions on non-critical scenarios

## Running Tests

```bash
# Run a specific skill's regression tests
bash skills/public/<skill-name>/tests/test_regression.sh

# Validate all skill structures (not functional tests)
npm run skills:validate

# Check language policy
npm run check:chinese
```

## CI Scope

The CI pipeline runs `npm run skills:validate` and `npm run check:chinese` on every PR. Functional tests run scoped to changed skills. All three gates must pass before merge.
