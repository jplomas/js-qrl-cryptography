# Release Process

This project automates versioning through **semantic-release**, which analyzes commit messages to determine version bumps and publish releases automatically.

## How It Works

The system uses **Conventional Commits** format to trigger different version changes:

- `fix:` triggers patch versions (1.0.0 → 1.0.1)
- `perf:` triggers patch versions (1.0.0 → 1.0.1)
- `feat:` triggers minor versions (1.0.0 → 1.1.0)
- `BREAKING CHANGE:` or `!` triggers major versions (1.0.0 → 2.0.0)

Other prefixes (`chore:`, `docs:`, `test:`, `refactor:`, `ci:`, `deps:`) do not trigger releases.
(The exact mapping lives in `.releaserc.json` — keep this list in sync with it.)

## Commit Message Format

Messages follow this template:

```
type(scope): description

[optional body]

[optional footer]
```

Examples:

```
fix: harden Argon2id parameter validation

feat(mldsa): expose deterministic signing helper

feat(hash): add keccak256 streaming interface

feat(mldsa)!: hedged signing by default

BREAKING CHANGE: ml_dsa87.sign now defaults to randomized (hedged) signing
```

## Conventional-commit scopes

Use one of these scopes (or omit if the change is repo-wide):

- `(mldsa)` — ML-DSA-87 / FIPS 204 signatures
- `(hash)` — Keccak hashes
- `(aes)` — AES-256-GCM
- `(kdf)` — Argon2id
- `(random)` — CSPRNG helpers
- `(utils)` — encoding / shared helpers
- `(build)` — TypeScript / packaging
- `(ci)` — workflows
- `(deps)` — dependency bumps (Dependabot uses this prefix automatically)

## Workflow

1. Create feature branches with properly formatted commits
2. Submit pull requests to `main`
3. Upon merge, GitHub Actions automatically:
   - Runs the full CI battery (lint, tests, dist-check, packaging smoke, browser tests)
   - Waits for the **`npm-publish` environment approval** (a human approves the deployment before anything publishes)
   - Analyzes commits since the last release and calculates the version
   - Updates `package.json`, generates the changelog, commits and tags
   - **Publishes to npm via trusted publishing (OIDC — no long-lived token), with provenance, *before* the GitHub release is created** — a GitHub release existing implies the version is on npm
   - Creates the GitHub release
   - **Verifies the registry actually serves the new version** (10 × 15 s retry) before any supply-chain artifacts are produced
   - Packs the release tarball once and generates SBOMs (SPDX + CycloneDX), checksums, attestations, and SLSA Level 3 provenance from that exact commit and those exact bytes
4. Release runs are **queued, never cancelled** (`cancel-in-progress: false`): a cancellation landing between the tag push and the npm publish would orphan the release.

If a publish still fails after the tag exists: **supersede, don't backfill** — land a trivial `fix:`, burn the version number, never move or delete tags.

## Best Practices

- Write atomic commits (one logical change per commit)
- Use clear, imperative-mood subjects under 72 characters
- Include detailed explanations in commit bodies when needed
- Reference relevant issues in footers (e.g., `Fixes #123`)
- Use the scopes listed above for consistency

## Security fixes

Security fixes follow the same flow as everything else (`fix:` commit → merge to `main` → automated patch release). The end-to-end latency is ~30 minutes from merge to published npm package, plus however long the `npm-publish` environment approval waits for a human. There is no manual fast-path; coordinate disclosure timing accordingly.

Note for upstream `@noble/hashes` fixes: the CJS build vendors noble (see SECURITY.md "Bundled dependencies"), so a noble security patch is release-blocking here — bump the pin, rebuild `dist/`, and land as `fix:` the same day.
