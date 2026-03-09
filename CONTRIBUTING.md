# Contributing

Thanks for contributing to `labali-skills`.

## Development Setup

```bash
npm run skill:init -- <name> --path skills/public --resources scripts,references,assets
npm run skill:validate -- skills/public/<name>
npm run skills:validate
```

Standards reference:

- Mandatory skill standards: `DEVELOPMENT.md` section 8
- Recommended layered design: `DEVELOPMENT.md` section 8.1
- Terminology/style glossary: `DEVELOPMENT.md` section 8.2

## Pull Request Checklist

- Keep changes scoped and minimal.
- Follow naming and structure rules in `DEVELOPMENT.md`.
- If skill structure/frontmatter changed, run `npm run skills:validate`.
- If skill behavior logic changed, run relevant skill regression tests.
- Update docs when behavior or process changes.

## Commit Message Convention

Use conventional style:

- `feat(skill): ...`
- `fix(skill): ...`
- `docs: ...`
- `chore: ...`

## Reporting Issues

Please use issue templates and include reproduction steps.
