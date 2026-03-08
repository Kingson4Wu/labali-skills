# Git Commit Standards

To maintain clear and consistent commit history, we follow professional Git commit standards.

## Commit Message Format

```text
<type>(<scope>): <subject>

<body>

<footer>
```

## Commit Types

- `feat`: New feature
- `fix`: Bug fix
- `bug`: Bug fix (synonymous with `fix`)
- `docs`: Documentation update
- `style`: Code formatting adjustment (changes that do not affect code meaning)
- `refactor`: Code refactoring (neither bug fix nor feature)
- `perf`: Performance optimization
- `test`: Test-related changes
- `build`: Build system or external dependency changes
- `ci`: CI configuration and script changes
- `chore`: Other changes that do not modify src or test files
- `revert`: Rollback previous commit

## Scope

Scope should identify the stage or component affected by the commit, such as:

- `stage1`
- `stage2/cli-tools`
- `stage3/user-api`
- `tests`
- `config`

## Commit Message Standards

1. Write commit messages in English.
2. Keep first line brief (under 72 chars).
3. Use a real blank line between subject and body.
4. Body is optional and can include reason and impact.
5. Do not commit temporary build artifacts; use `.gitignore`.
6. Do not include `Co-authored-by` lines.
7. Run `scripts/clean_commit.sh` after commit.

## Examples

```text
feat(stage1/calculator): implement basic arithmetic operations

- Add add, subtract, multiply, divide functions
- Add input validation
- Handle division by zero error
```

```text
fix(stage2/cli): fix file path resolution in renamer

- Correct path handling for cross-platform compatibility
- Add tests for Windows path handling
```
