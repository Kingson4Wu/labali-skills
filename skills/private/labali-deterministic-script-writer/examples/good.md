# Good Deterministic Script Spec Examples

These examples show correctly structured specs with no runtime reasoning.

---

## Example 1 — Whisper transcription of a single audio file

**User intent:** "Transcribe /recordings/ep12.mp3 to text using Whisper, language Chinese, output to /out/ep12.txt"

---

### Task

Transcribe a single local audio file using Whisper CLI and write the plain-text output to a specified path.

### Preconditions

- [ ] `/recordings/ep12.mp3` exists and is readable
- [ ] `whisper` is available in PATH (`which whisper`)
- [ ] `/out/` directory exists and is writable

### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `input_path` | string | yes | — | Absolute path to the audio file |
| `output_path` | string | yes | — | Absolute path for the output `.txt` file |
| `language` | string | no | (omitted) | Whisper language flag value |
| `model` | string | no | `medium` | Whisper model name |

### Deterministic Steps

1. **Validate preconditions** — check file existence, whisper in PATH, output dir writable. Exit 1 on first failure.
2. **Build Whisper command** — construct fixed command: `whisper <input_path> --model <model> --output_format txt --output_dir <output_dir> [--language <language>]`
3. **Execute Whisper** — run the command, capture stdout/stderr.
4. **Assert output file exists** — check `<output_dir>/<input_stem>.txt` exists after run.
5. **Return result** — `{ status: "ok", data: { output_path: "..." } }`

### Step Assertions

| After step | Assertion | Failure message |
|------------|-----------|-----------------|
| Step 3 | Exit code is 0 | `"whisper exited with code <n>: <stderr>"` |
| Step 4 | Output `.txt` file exists | `"whisper ran but output file not found at <path>"` |

### Fail-Fast Rules

- Missing input file → exit immediately.
- `whisper` not in PATH → exit immediately with install hint.
- No retry on Whisper failure. Surface stderr verbatim.

---

## Example 2 — Git stage-and-commit with fixed message

**User intent:** "Stage all changes and commit with message 'chore: update dependencies'"

---

### Task

Stage all working tree changes and create a single git commit with a fixed message.

### Preconditions

- [ ] Current directory is inside a git repository (`git rev-parse --git-dir`)
- [ ] There are uncommitted changes (`git status --porcelain` is non-empty)

### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `message` | string | yes | — | Exact commit message subject line |
| `body` | string | no | — | Optional commit body (appended after blank line) |

### Deterministic Steps

1. **Validate preconditions** — verify git repo, verify dirty working tree.
2. **Stage all changes** — run `git add -A`.
3. **Assert staging** — run `git diff --cached --name-only`, assert non-empty.
4. **Commit** — run `git commit -m "<message>"` (with body if provided).
5. **Assert commit** — run `git rev-parse HEAD`, capture and return hash.
6. **Return result** — `{ status: "ok", data: { commit_hash: "...", subject: "..." } }`

### Fail-Fast Rules

- Not a git repo → exit 1.
- No changes to stage → exit 1, message: `"No changes to commit."`.
- Commit exits non-zero → exit 1, surface stderr verbatim.
- No hidden retry on commit failure.

---

**Why these are good specs:**
- Every step has a fixed action, not a description of a goal
- Assertions are binary checks, not qualitative judgments
- No "if unsure, try alternatives" — branches are explicit and exhaustive
- Parameters are typed and bounded; no free-form inference at runtime
