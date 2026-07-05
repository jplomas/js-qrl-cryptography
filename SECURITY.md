# Security Policy

## Supported Versions

Only the latest minor release line receives security fixes. Older lines are not patched.

## Reporting Vulnerabilities

Please report security vulnerabilities to **security@theqrl.org**.

Do not open public issues for security vulnerabilities. We follow coordinated disclosure: please give us reasonable time to investigate and ship a fix before any public disclosure.

---

## Scope

`@theqrl/qrl-cryptography` is a thin TypeScript layer over audited primitives. The supplied modules are:

| Module        | Primitive                          | Underlying implementation       |
|---------------|------------------------------------|---------------------------------|
| `keccak`      | Keccak-224 / -256 / -384 / -512    | `@noble/hashes`                 |
| `argon2id`    | Argon2id KDF                       | `@noble/hashes`                 |
| `random`      | CSPRNG                             | WebCrypto `getRandomValues`     |
| `aes`         | AES-256-GCM                        | WebCrypto (`SubtleCrypto`)      |
| `ml_dsa87`    | ML-DSA-87 (FIPS 204)               | `@theqrl/mldsa87`               |

Bugs in the underlying implementations should be reported upstream; this policy covers the wrapper code, parameter handling, encoding, and packaging.

---

## Security model & sharp edges

### AES-256-GCM (`aes`)

- Prefer the misuse-resistant **`seal`/`open`** pair: `seal` draws a fresh 12-byte IV from the CSPRNG on every call and prepends it to the ciphertext, so the IV-reuse footgun below cannot be hit through that API. The raw `encrypt`/`decrypt` pair remains available for callers who must manage the IV themselves.
- For the raw `encrypt`/`decrypt` pair, the IV (12 bytes) **must be unique per (key, plaintext) pair**. Reusing an IV with the same key destroys confidentiality and authenticity.
- When using the raw pair, callers must source IVs from a CSPRNG (e.g. `random.getRandomBytesSync`). `seal` does this for you.
- AES-GCM has a hard limit of ~2³² messages per key before nonce-collision probability becomes non-negligible — rotate keys for high-volume use.

### Argon2id (`argon2id`)

- Defaults must be tuned for the target environment. The library accepts caller-supplied `t` (iterations), `m` (memory), `p` (parallelism), and salt; weak parameters produce weak hashes.
- Salts must be ≥16 bytes and unique per password; reusing salts undermines the KDF.

### CSPRNG (`random`)

- Backed by the platform WebCrypto `crypto.getRandomValues` in both browsers and Node. Where no WebCrypto is available, calls throw — the library does not silently fall back to a weaker PRNG.
- Requests are chunked at the 64 KiB per-call WebCrypto quota, so any size up to 2³² − 1 bytes works.
- Requests of ≥16 bytes throw `getRandomValues returned all zeros` if the platform RNG returns all zeros (p = 2⁻¹²⁸ from a healthy RNG). This is a tripwire for catastrophically broken platform RNGs, not an entropy measurement.

### Keccak (`keccak`)

- The module exposes the four Keccak variants (keccak-224/-256/-384/-512) only — not FIPS-padded SHA-3 or the SHAKE XOFs.
- These are unkeyed hashes, not MACs. Do not use them for authentication without HMAC or a keyed construction.

### ML-DSA-87 (`ml_dsa87`)

- Post-quantum digital signature scheme (FIPS 204), NIST Level 5.
- Public key 2,592 bytes, secret key 4,896 bytes, signature 4,627 bytes.
- **Signing is hedged by default** (FIPS 204 §3.4): fresh CSPRNG randomness enters each signature's nonce, frustrating fault-injection attacks against deterministic signing. Deterministic signing (`randomizedSigning: false`) is an explicit opt-in for byte-reproducible use cases only.
- **Seeds are secret keys**: anything that can regenerate the keypair has the same power as the secret key. When `keygen()` draws its own seed, the wrapper wipes that buffer (best-effort) after key generation. When the caller supplies a seed, the caller owns its lifecycle and should wipe it after use.
- Zeroization in JavaScript is best-effort only: the runtime may hold copies (GC, JIT, swap) that no library can erase. Returned key buffers (`publicKey`, `secretKey`) are caller-owned; callers handling long-lived keys should overwrite them when done and minimize copies.

### Constant-time considerations

- **ML-DSA-87 signing is not constant-time.** The underlying `@theqrl/mldsa87` documents this candidly: rejection sampling is inherently key-dependent and JavaScript arithmetic carries no constant-time guarantee (measured cross-key spread is documented in that package's SECURITY.md). Verification uses a constant-time challenge comparison. Deployments exposing a signing oracle should rate-limit and prefer hedged signing; for strict constant-time requirements use go-qrllib.
- AES-256-GCM is delegated to WebCrypto, which uses platform-provided constant-time implementations on supported hardware (AES-NI / ARMv8 Crypto Extensions). On platforms lacking hardware AES, software fallbacks may not be constant-time.
- The wrapper code in this package contains no secret-dependent branches or table lookups, but auditors should verify before deploying in side-channel-sensitive environments.

---

## Bundled dependencies (CJS build)

The CommonJS build (`dist/cjs`) **vendors a frozen copy of `@noble/hashes`**, because noble is ESM-only and CJS consumers must be able to `require()` this package. Consequences:

- ESM consumers (`dist/mjs`) resolve `@noble/hashes` through npm normally and see upstream patches via their own dependency tree.
- **CJS consumers run the snapshot bundled at our build time, invisible to their `npm audit`.** An upstream `@noble/hashes` security fix reaches CJS consumers only through a new `@theqrl/qrl-cryptography` release.
- The patch playbook is therefore: upstream noble fix → bump the pinned `@noble/hashes` here → `npm run build` (re-vendors `dist/cjs`) → land as `fix:` so semantic-release ships a patch the same day.
- `@theqrl/mldsa87` is **not** bundled — it is resolved through npm by both build flavours and patches flow normally.

---

## Supply-chain security

Publishing uses **npm trusted publishing** (OIDC): no long-lived npm token exists; the publish is gated by the `npm-publish` GitHub environment and runs only after CI passes. Each release ships:

- **npm provenance** attesting the GitHub Actions build (generated automatically under trusted publishing)
- **SBOMs** in SPDX and CycloneDX format, attached to the GitHub release
- **SHA-256 / SHA-512 checksums** of `package.json`, `package-lock.json`, and source files
- **GitHub build provenance attestations** (`actions/attest-build-provenance`) for checksums and SBOMs
- **SLSA Level 3 provenance** (`slsa-framework/slsa-github-generator`) attached to the release as `provenance.intoto.jsonl`

To verify a release, see the artefacts on the corresponding GitHub release page and use `gh attestation verify` or `slsa-verifier`.

**Advisory gating.** CI gates releases on the shipped (runtime) dependency tree only (`npm audit --omit=dev`): a real advisory in code that reaches consumers blocks the build. Development- and build-only advisories carry no consumer-facing risk (nothing under `devDependencies` is published — `files` ships only `dist` and `src`), so they are tracked and remediated out of band by Dependabot (weekly version updates plus GitHub Dependabot security updates) rather than gating consumer-safe releases.

---

## Disclosure timeline

1. Report received → acknowledgement within 72 hours
2. Triage and reproduction → within 7 days
3. Fix developed and reviewed → typically within 30 days for high/critical
4. Coordinated release with reporter
5. Public advisory via GitHub Security Advisories
