# Anti-Pattern Deterministic Script Spec Examples

These examples show common violations of determinism principles.

---

## Anti-pattern 1 — Runtime reasoning disguised as steps

**Problematic spec:**

```
Step 2: Find the correct output directory.
  - If the user gave an output path, use it.
  - If not, try to guess from the input file name.
  - If unsure, ask the user or use the current directory.

Step 3: Choose the best Whisper model.
  - Use "large" for long files, "medium" for short ones.
  - If file size is unknown, default to "medium" and retry with "large" if quality is poor.
```

**Problems:**
- "Find the correct" and "guess from" introduce runtime inference
- "If unsure, ask the user" breaks the no-reasoning constraint — the script cannot ask
- "If quality is poor" is a semantic judgment, not a binary assertion
- "retry with large" is a hidden retry loop based on qualitative evaluation

**Fixed version:** require `output_dir` and `model` as explicit parameters. If omitted, fail with `REQUIRED: output_dir`. Never infer or loop on quality.

---

## Anti-pattern 2 — Candidate exploration

**Problematic spec:**

```
Step 4: Click the Submit button.
  - Try button with text "Submit".
  - If not found, try "Publish", "Confirm", or "Save".
  - If still not found, look for any primary-colored button in the form area.
```

**Problems:**
- This is a semantic selector strategy, not a deterministic step
- The "try alternatives" pattern is a policy executor pattern, not a script spec
- A deterministic script must have a fixed selector; if the UI can vary, the spec must document the exact known selector and fail fast if absent
- Candidate exploration at runtime is non-deterministic by definition

**Fixed version:** document the exact selector: `button[aria-label="Submit"]`. If not found, exit with `ASSERTION FAILED: Submit button not found`. The selector discovery belongs in the strategy layer, not the script spec.

---

## Anti-pattern 3 — Missing assertions, silent failures

**Problematic spec:**

```
Step 3: Run ffmpeg to extract audio.
Step 4: Run Whisper on the extracted audio.
Step 5: Check if output was created.
```

**Problems:**
- Step 3 has no assertion — if ffmpeg fails silently, Step 4 runs on a missing file
- Step 4 has no assertion — Whisper might exit 0 but produce no output
- Step 5 is vague: what exactly is checked? What happens if the check fails?

**Fixed version:** after each step, assert exit code == 0, assert output file exists. On any assertion failure, exit 1 with a specific message naming the step and the failure condition.

---

## Anti-pattern 4 — Under-specified parameters with implicit defaults

**Problematic spec:**

```
Parameters:
- input_path: the file to process
- output_path: where to put results (optional, will figure it out)
- options: any other settings the user wants
```

**Problems:**
- "will figure it out" means runtime inference — forbidden in deterministic specs
- `options: any other settings` is unbounded — a script cannot be deterministic with open-ended parameters
- No types, no required flags, no concrete defaults

**Fixed version:** enumerate every parameter with exact type, required/optional, and a concrete default or `REQUIRED` marker. No parameter should be described as "anything the user wants."

---

## Anti-pattern 5 — Retry loops without explicit bounds (or any retry at all)

**Problematic spec:**

```
Step 5: Verify the episode was published.
  - Check the Published list for the episode title.
  - If not found, wait 5 seconds and check again.
  - Repeat until found or until giving up.
```

**Problems:**
- "Until giving up" is not a deterministic exit condition
- Retry loops belong in policy executors, not deterministic scripts
- Waiting for an external state change makes the script time-dependent and non-deterministic
- "Repeat until found" can loop forever

**Fixed version:** a deterministic script checks once and reports the result. If the business state requires polling, that logic belongs in the strategy/policy layer, and the script should be called with explicit retry count and interval as fixed parameters — not embedded loops.
