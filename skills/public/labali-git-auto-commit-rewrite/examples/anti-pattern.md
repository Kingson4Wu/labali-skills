# Anti-Pattern Commit Message Examples

These examples show common mistakes to avoid.

---

## Anti-pattern 1 — Vague subject

```
update files
```

**Problems:**
- No type prefix
- "update files" is what every commit does — zero information
- No scope, no subject

**Fixed:** `feat(skill): add license and compatibility to SKILL.md frontmatter`

---

## Anti-pattern 2 — Laundry-list body that maps to nothing

```
feat: various improvements

- updated some files
- fixed some issues
- added new feature
- cleaned up code
```

**Problems:**
- Body bullets are generic placeholders, not tied to real changes
- "various improvements" in subject hides what actually changed
- A reader cannot review this commit without reading the entire diff

**Fixed:** Name the actual files, mechanisms, and decisions changed.

---

## Anti-pattern 3 — Subject too long

```
feat(skill): add license field (MIT) and compatibility field describing environment and dependency requirements to all 17 SKILL.md frontmatter sections across public and private skills
```

**Problems:**
- 155 characters — unreadable in git log one-line view
- All that detail belongs in the body, not the subject

**Fixed:** `feat(skill): add license and compatibility to all SKILL.md frontmatter`

---

## Anti-pattern 4 — Wrong type

```
fix: add examples/ directories to four skills
```

**Problems:**
- Adding new directories is not a bug fix
- Should be `feat` (new capability) or `docs` (documentation/guidance)

**Fixed:** `docs(skill): add examples and templates to 4 skills`

---

## Anti-pattern 5 — Fabricated body

```
feat(auth): implement token refresh logic

- rewrote authentication module
- improved performance by 40%
- fixed all known security issues
```

**Problems:**
- Performance numbers not from measurement
- "all known security issues" is unverifiable
- "rewrote" is vague — which part, why?

**Rule:** Every bullet must correspond to a real, reviewable change in the diff.

---

## Anti-pattern 6 — Missing blank line between subject and body

```
feat(skill): add compatibility field
- add to all 17 SKILL.md files
- use per-type values based on actual dependencies
```

**Problems:**
- Git requires a blank line between subject and body for proper parsing
- Many tools will display this as a single run-on line

**Fixed:** Always include exactly one blank line after the subject.
