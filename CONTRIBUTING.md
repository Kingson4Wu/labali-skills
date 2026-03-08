# Contributing

Thanks for contributing to `labali-skills`.

## Development Setup

```bash
npm run skills:validate
```

Use the commands below for day-to-day work:

```bash
npm run skill:init -- <name> --path skills/public --resources scripts,references,assets
npm run skill:validate -- skills/public/<name>
npm run skills:validate
```

## Pull Request Checklist

- Keep changes scoped and minimal.
- Follow naming and structure rules in `DEVELOPMENT.md`.
- If skill structure/frontmatter changed, run `npm run skills:validate`.
- Update docs when behavior or process changes.

## Commit Message Convention

Use conventional style:

- `feat(skill): ...`
- `fix(skill): ...`
- `docs: ...`
- `chore: ...`

## Reporting Issues

Please use issue templates and include reproduction steps.
