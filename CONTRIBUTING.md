# Contributing to @theqrl/qrl-cryptography

## What this package is

A thin, strictly-typed TypeScript wrapper exposing the cryptographic primitives QRL JavaScript applications use (Keccak, Argon2id, CSPRNG, AES-256-GCM, ML-DSA-87). All cryptography is delegated to audited implementations (`@noble/hashes`, `@theqrl/mldsa87`, WebCrypto). **Do not implement cryptography here** — validation, delegation, encoding, and packaging only.

## Repo invariants

1. **No entry point, by design.** `src/index.ts` throws; consumers import per-primitive subpaths (`/keccak`, `/aes`, …) so browser bundles stay small without trusting tree-shaking. Don't add a barrel export.
2. **`dist/` is committed.** Every `src/` change requires `npm run build` and committing the result — the `dist-check` CI job fails otherwise. This keeps the published artifact reviewable in diffs and lets the packaging smoke test exercise the real bytes.
3. **The CJS build vendors `@noble/hashes`** (it's ESM-only). A noble security fix is release-blocking: bump the pin, rebuild, land as `fix:` (see SECURITY.md "Bundled dependencies"). `@theqrl/mldsa87` is *not* vendored.
4. **Signing-mode doctrine** (playbook §2.3): `ml_dsa87.sign` is hedged by default; deterministic signing is an explicit `randomizedSigning: false` at the call site, used only where byte-reproducibility is the point (KATs, fixtures). Never flip this default casually — it is a security posture, and the KAT tests pin it.
5. **Seeds are secret keys.** Internally-drawn keygen seeds are wiped in `finally`; caller-supplied seeds are caller-owned. Preserve both halves of that contract.
6. **Error classes** (playbook §6.1): `verify` is total (returns `false` on attacker-controllable garbage, never throws); key-handling APIs throw fast on caller error; tripwires (RNG all-zeros) throw loudly with a comment stating the invariant.

## Toolchain

- **Node ≥20.19, npm ≥8.3.** The repo standardizes on Node 22 (`.nvmrc`); run `nvm use` before any npm command. The lockfile is `lockfileVersion: 3` and the build relies on `overrides`, both of which require npm ≥8.3 — installing under an older npm silently rewrites the lockfile to v1 and drops every override (a real incident; it reverted pinned deps to vulnerable versions). If `npm --version` is single-digit, you are on the wrong Node.
- **Pins are exact** — dependencies *and* devDependencies. Dependabot does the bumping (weekly, 7-day cooldown; `@noble/*` and `@theqrl/*` get individual PRs). `npm audit` must be 0, including dev — bundled-dep findings are cleared by pinning the bundling package (e.g. `npm`, `esbuild`) in `overrides`.
- **Prettier is the formatter** (house-canonical config: single quotes, width 120, `es5` trailing commas — adopted 2026-06-13). ESLint defers to it and lints *everything executable*: `src`, `test`, `scripts`, `browser-tests`, configs. `npm run lint` runs with `--max-warnings 0` — warnings are failures.
- **Coverage is 100% and ratcheted** (playbook §4.4): `c8 check-coverage` (package.json) and Codecov (`.codecov.yml`, project+patch 100%) both gate. Unreachable lines get `/* c8 ignore */` *with an adjacent rationale*, in exactly two categories: statistically unreachable, or defensively unreachable. "Hard to test" is not a rationale — write the test.
- c8 runs with `experimental-monocart: true`: the default v8-to-istanbul conversion mis-maps tsx/esbuild sourcemaps and reports phantom uncovered branches at module boundaries; the monocart converter maps them correctly. Don't remove the flag without re-verifying branch coverage is artifact-free.
- **Editor settings**: `.vscode/settings.json` is tracked on purpose (shared formatter wiring); `.idea/` is ignored.

## Tests you must keep green (and extend in kind)

| Suite | What it locks |
|---|---|
| KAT vectors (`test/test-vectors/ml_dsa87.ts`) | go-qrllib-derived seeds → byte-exact pk/sk/sig (deterministic mode, explicit `false`) |
| Tamper suites | AES-GCM auth failure on any ciphertext/tag/key/IV mutation; ML-DSA verify → `false` on any mauled input |
| Signing modes | hedged default differs across calls and verifies; deterministic reproduces vectors |
| CSPRNG | 64 KiB chunking, all-zero tripwire, size validation (stubbed `globalThis.crypto`) |
| Packaging smoke (`npm run test:packaging`) | packs the real tarball, installs it in a throwaway consumer, requires + imports every subpath, compiles a strict `nodenext` TS consumer |
| Browser bundler matrix (`npm run browser-tests`) | the full suite under Parcel, webpack, and Rollup in Chromium |

When adding a feature, ask which of these would catch its regression — if none, add one in the same PR.

## Releases

Conventional commits choreograph semantic-release: `fix:` → patch, `feat:` → minor, `feat!:`/`BREAKING CHANGE:` → major; `chore:/docs:/test:/ci:/deps:` don't release. **Choosing the prefix is choosing the release** — a security fix committed as `chore:` silently doesn't ship. See RELEASE.md for the pipeline (trusted publishing via OIDC, environment-gated, publish-before-GitHub-release, verify-live, queued concurrency).

## Pin table (resolution paths beyond package.json)

| What | Where | Policy |
|---|---|---|
| GitHub Actions | `.github/workflows/*.yml` | 40-char SHA + `# vX.Y.Z` comment; Dependabot bumps weekly |
| SLSA generator | `release.yml` | **tag-pinned by requirement** (documented exception in `.github/zizmor.yml`) |
| actionlint engine | `actionlint.yml` `with: version:` | explicit version — the action defaults to `latest` |
| SSH host keys | `release.yml` known_hosts | GitHub's published keys (api.github.com/meta), pinned — never run-time `ssh-keyscan` |
| Vendored `@noble/hashes` | `dist/cjs` (committed) | frozen at build time; patch playbook in SECURITY.md |
| npm (audit overrides) | `overrides.npm` | pinned to clear bundled-dep advisories; re-evaluate at each Dependabot pass |

## Before you push

Running `npm install` configures the repository's pre-commit hook. It rebuilds
and verifies `dist/` using the same `npm run verify:dist` command as CI. If it
fails, stage the regenerated files and commit again.

```bash
npm run lint && npm test && npm run coverage && npm run build && git status   # dist must be clean or committed
npm run test:packaging                                                        # packaging smoke
npm run browser-tests                                                         # if you touched src/ or packaging
```

Workflow changes additionally need local `actionlint` and `zizmor --persona pedantic --config .github/zizmor.yml .github/workflows/` runs.
