# Security Policy

## Supported Versions

Only the latest minor release line receives security fixes. Older lines are not patched.

## Reporting Vulnerabilities

Please report security vulnerabilities to **security@theqrl.org**.

Do not open public issues for security vulnerabilities. We follow coordinated disclosure: please give us reasonable time to investigate and ship a fix before any public disclosure.

---

## Scope

`@theqrl/qrl-cryptography` is a thin TypeScript layer over audited primitives. The supplied modules are:

| Module        | Primitive                  | Underlying implementation       |
|---------------|----------------------------|---------------------------------|
| `keccak`      | Keccak-256, SHA-3, SHAKE   | `@noble/hashes`                 |
| `argon2id`    | Argon2id KDF               | `@noble/hashes`                 |
| `random`      | CSPRNG                     | `@noble/hashes/crypto`          |
| `aes`         | AES-256-GCM                | WebCrypto / Node `crypto`       |
| `ml_dsa87`    | ML-DSA-87 (FIPS 204)       | `@theqrl/mldsa87`               |

Bugs in the underlying implementations should be reported upstream; this policy covers the wrapper code, parameter handling, encoding, and packaging.

---

## Security model & sharp edges

### AES-256-GCM (`aes`)

- The IV (12 bytes) **must be unique per (key, plaintext) pair**. Reusing an IV with the same key destroys confidentiality and authenticity.
- Callers must source IVs from a CSPRNG (e.g. `random.getRandomBytes`). The library does not generate them for you.
- AES-GCM has a hard limit of ~2³² messages per key before nonce-collision probability becomes non-negligible — rotate keys for high-volume use.

### Argon2id (`argon2id`)

- Defaults must be tuned for the target environment. The library accepts caller-supplied `t` (iterations), `m` (memory), `p` (parallelism), and salt; weak parameters produce weak hashes.
- Salts must be ≥16 bytes and unique per password; reusing salts undermines the KDF.

### CSPRNG (`random`)

- Backed by WebCrypto in browsers and Node's `crypto` in Node. In environments where neither is available, calls will throw — the library does not silently fall back to a weaker PRNG.

### Keccak / SHA-3 / SHAKE (`keccak`)

- These are unkeyed hashes, not MACs. Do not use them for authentication without HMAC or a keyed construction.

### ML-DSA-87 (`ml_dsa87`)

- Post-quantum digital signature scheme (FIPS 204), NIST Level 5.
- Public key 2,592 bytes, secret key 4,896 bytes, signature 4,627 bytes.
- Secret-key material must be kept in protected memory. The library does not zeroize buffers — callers handling long-lived keys should manage that themselves.
- Signing is deterministic by default; if callers expose hedged signing, the entropy source must be a CSPRNG.

### Constant-time considerations

- ML-DSA-87 is implemented in `@theqrl/mldsa87`; constant-time guarantees are inherited from that package.
- AES-256-GCM is delegated to WebCrypto/Node `crypto`, which use platform-provided constant-time implementations on supported hardware (AES-NI / ARMv8 Crypto Extensions). On platforms lacking hardware AES, software fallbacks may not be constant-time.
- The wrapper code in this package contains no secret-dependent branches or table lookups, but auditors should verify before deploying in side-channel-sensitive environments.

---

## Supply-chain security

Each release ships:

- **npm provenance** (`npm publish --provenance`) attesting the GitHub Actions build
- **SBOMs** in SPDX and CycloneDX format, attached to the GitHub release
- **SHA-256 / SHA-512 checksums** of `package.json`, `package-lock.json`, and source files
- **GitHub build provenance attestations** (`actions/attest-build-provenance`) for checksums and SBOMs
- **SLSA Level 3 provenance** (`slsa-framework/slsa-github-generator`) attached to the release as `provenance.intoto.jsonl`

To verify a release, see the artefacts on the corresponding GitHub release page and use `gh attestation verify` or `slsa-verifier`.

---

## Disclosure timeline

1. Report received → acknowledgement within 72 hours
2. Triage and reproduction → within 7 days
3. Fix developed and reviewed → typically within 30 days for high/critical
4. Coordinated release with reporter
5. Public advisory via GitHub Security Advisories
