# Testing and Regression

Reference this document when writing or running skill tests.

## Functional Tests

Each skill should include test cases (e.g., `tests/test_regression.sh` or `tests/cases.yaml`) that cover:

- Key execution paths
- Fallback branches
- Historically regression-prone scenarios

## Regression Evaluation

Prompt or generation-logic changes should be compared against a baseline:

- Baseline vs new behavior comparison
- No regression on critical scenarios
- Must-pass cases for key behavior verified
