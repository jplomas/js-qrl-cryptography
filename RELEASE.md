# Release Process

This project automates versioning through **semantic-release**, which analyzes commit messages to determine version bumps and publish releases automatically.

## How It Works

The system uses **Conventional Commits** format to trigger different version changes:

- `fix:` triggers patch versions (1.0.0 → 1.0.1)
- `feat:` triggers minor versions (1.0.0 → 1.1.0)
- `BREAKING CHANGE:` or `!` triggers major versions (1.0.0 → 2.0.0)

Other prefixes (`chore:`, `docs:`, `test:`, `refactor:`) do not trigger releases.

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

feat!: change keccak output encoding

feat: add SHAKE-256 streaming API

BREAKING CHANGE: keccak now returns Uint8Array instead of hex string
```

## Conventional-commit scopes

Use one of these scopes (or omit if the change is repo-wide):

- `(mldsa)` — ML-DSA-87 / FIPS 204 signatures
- `(hash)` — Keccak / SHA-3 / SHAKE
- `(aes)` — AES-256-GCM
- `(kdf)` — Argon2id
- `(curves)` — secp256k1 / `@noble/curves` wrappers
- `(random)` — CSPRNG helpers
- `(utils)` — encoding / shared helpers
- `(build)` — TypeScript / packaging
- `(ci)` — workflows
- `(deps)` — dependency bumps (Dependabot uses this prefix automatically)

## Workflow

1. Create feature branches with properly formatted commits
2. Submit pull requests to `main`
3. Upon merge, GitHub Actions automatically:
   - Analyzes commits since the last release
   - Calculates the appropriate version number
   - Updates `package.json` version
   - Generates changelog from commit messages
   - Builds and commits `dist/` so the published artefact matches the source
   - Publishes to npm with `--provenance`
   - Creates a Git tag and GitHub release
   - Generates SBOMs (SPDX + CycloneDX), checksums, and SLSA Level 3 provenance attached to the release

## Best Practices

- Write atomic commits (one logical change per commit)
- Use clear, imperative-mood subjects under 72 characters
- Include detailed explanations in commit bodies when needed
- Reference relevant issues in footers (e.g., `Fixes #123`)
- Use the scopes listed above for consistency

## Security fixes

Security fixes follow the same flow as everything else (`fix:` commit → merge to `main` → automated patch release). The end-to-end latency is ~30 minutes from merge to published npm package. There is no manual fast-path; coordinate disclosure timing accordingly.
