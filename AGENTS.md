# AGENTS.md

Guidance for AI agents and contributors working on this repository.

## Commit convention

Every commit message must use a [Conventional Commits](https://www.conventionalcommits.org/) prefix.

```
<type>: <summary>
```

Types:

- `feat:` a new feature
- `fix:` a bug fix
- `docs:` documentation only
- `style:` formatting, whitespace, no code change
- `refactor:` code change that neither fixes a bug nor adds a feature
- `perf:` a code change that improves performance
- `test:` adding or correcting tests
- `build:` build system or external dependencies (npm, Docker, CI)
- `ci:` CI configuration and workflows
- `chore:` routine tasks that do not modify source or tests

Rules:

- Use the imperative mood and lowercase summary ("add", "fix", "remove").
- Keep the summary short, under ~72 characters.
- Do not add a trailing period.
- A scope is optional, e.g. `fix(docker): correct status cache`.
- Breaking changes get a `!` after the type, e.g. `feat!: ...`.

### Examples

```
feat: add category filtering
fix(docker): handle missing groups header
docs: document access groups
ci: publish Docker image on release
```

## Versioning

- Releases are tagged as `vX.Y.Z` or `X.Y.Z`.
- Keep `CHANGELOG.md` updated under `[Unreleased]`; move it to a dated
  version heading when tagging a release.
- `package.json` version is bumped by the release workflow automatically.
