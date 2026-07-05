# @theqrl/qrl-cryptography

All pure-js cryptographic primitives normally used when
developing Javascript / TypeScript applications and tools for QRL.

The cryptographic primitives included are:

* [Hashes: keccak-256](#hasheskeccak-256)
* [KDFs: Argon2id](#kdfs-argon2id)
* [CSPRNG (Cryptographically strong pseudorandom number generator)](#csprng-cryptographically-strong-pseudorandom-number-generator)
* [AES Encryption](#aes-encryption)
* [ML-DSA-87](#ml-dsa-87)

## Usage

Use NPM / Yarn in node.js / browser:

```bash
# NPM
npm install @theqrl/qrl-cryptography

# Yarn
yarn add @theqrl/qrl-cryptography
```

See [browser usage](#browser-usage) for information on using the package with major Javascript bundlers. It is
tested with **Webpack, Rollup and Parcel**.

This package has no single entry-point, but submodule for each cryptographic
primitive. Read each primitive's section of this document to learn how to use
them.

The reason for this is that importing everything from a single file will lead to
huge bundles when using this package for the web. This could be avoided through
tree-shaking, but the possibility of it not working properly on one of
[the supported bundlers](#browser-usage) is too high.

```js
// Hashes
const { keccak256 } = require("@theqrl/qrl-cryptography/keccak");

// KDFs
const { argon2idSync } = require("@theqrl/qrl-cryptography/argon2id");

// Random
const { getRandomBytesSync } = require("@theqrl/qrl-cryptography/random");

// AES encryption
const { encrypt } = require("@theqrl/qrl-cryptography/aes");

// ML-DSA-87
const { ml_dsa87 } = require("@theqrl/qrl-cryptography/ml_dsa87");

// utilities
const { hexToBytes, toHex, utf8ToBytes } = require("@theqrl/qrl-cryptography/utils");
```

### A note for CommonJS (`require`) consumers

`@noble/hashes` is ESM-only, so the CommonJS build (`dist/cjs`) **vendors a
frozen copy of it** to keep `require()` working. That copy does not appear in
your `node_modules` tree, so your own `npm audit` cannot see it and an upstream
`@noble/hashes` advisory reaches you only through a new
`@theqrl/qrl-cryptography` release. ESM (`import`) consumers are unaffected —
they resolve `@noble/hashes` through their own dependency tree as usual. See
[SECURITY.md](./SECURITY.md#bundled-dependencies-cjs-build) for the version-pin
and patch-playbook details.

## Hashes: keccak-256
```typescript
function keccak256(msg: Uint8Array): Uint8Array;
```

Exposes following cryptographic hash functions:

- keccak-256 variant of SHA3 (also `keccak224`, `keccak384`,
and `keccak512`)

```js
const { keccak256, keccak224, keccak384, keccak512 } = require("@theqrl/qrl-cryptography/keccak");

keccak256(Uint8Array.from([1, 2, 3]))

// Can be used with strings
const { utf8ToBytes } = require("@theqrl/qrl-cryptography/utils");
keccak256(utf8ToBytes("abc"))

// If you need hex
const { bytesToHex: toHex } = require("@theqrl/qrl-cryptography/utils");
toHex(keccak256(utf8ToBytes("abc")))
```

`keccak256` also exposes an incremental (streaming) interface via
`keccak256.create()`, for hashing data that arrives in chunks:

```js
const hash = keccak256.create();
hash.update(utf8ToBytes("ab"));
hash.update(utf8ToBytes("c"));
hash.digest(); // === keccak256(utf8ToBytes("abc"))
```

## KDFs: Argon2id

```ts
function argon2id(password: Uint8Array, salt: Uint8Array, t: number, m: number, p: number, dkLen: number, onProgress?: (progress: number) => void): Promise<Uint8Array>;
function argon2idSync(password: Uint8Array, salt: Uint8Array, t: number, m: number, p: number, dkLen: number, onProgress?: (progress: number) => void): Uint8Array;
```

The `argon2id` submodule has two functions implementing the Argon2id key
derivation algorithm in synchronous and asynchronous ways. This algorithm is
very slow, and using the synchronous version in the browser is not recommended,
as it will block its main thread and hang your UI.

The `salt` must be at least 8 bytes (use **≥16 bytes**, fresh and random per
password — see [SECURITY.md](./SECURITY.md)). Tune `t`/`m`/`p` for your
environment; weak parameters produce weak hashes.

```js
const { argon2id } = require("@theqrl/qrl-cryptography/argon2id");
const { getRandomBytesSync } = require("@theqrl/qrl-cryptography/random");
const { utf8ToBytes } = require("@theqrl/qrl-cryptography/utils");

const salt = getRandomBytesSync(16); // fresh, random, ≥16 bytes — store it alongside the hash
console.log(await argon2id(utf8ToBytes("password"), salt, 8, 262144, 1, 32));
```

## CSPRNG (Cryptographically strong pseudorandom number generator)

```ts
function getRandomBytesSync(bytes: number): Uint8Array;
```

The `random` submodule generates cryptographically strong pseudo-random
data, backed by the platform WebCrypto
[`crypto.getRandomValues`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)
in both browsers and node.js. If no WebCrypto implementation is available
the function throws — there is no insecure fallback.

Requests are chunked at the 64 KiB per-call WebCrypto quota, so any size up
to 2³² − 1 bytes works. As an additional tripwire, requests of 16 bytes or
more throw if the platform RNG returns all zeros (probability 2⁻¹²⁸ from a
healthy RNG) — a canary for catastrophically broken platform RNGs, not an
entropy meter.

```js
const { getRandomBytesSync } = require("@theqrl/qrl-cryptography/random");
console.log(getRandomBytesSync(32));
```

## AES Encryption

```ts
// Misuse-resistant: generates a fresh IV internally (recommended).
function seal(msg: Uint8Array, key: Uint8Array): Promise<Uint8Array>;
function open(sealed: Uint8Array, key: Uint8Array): Promise<Uint8Array>;

// Raw AEAD: you supply and manage the IV.
function encrypt(msg: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array>;
function decrypt(cypherText: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array>;
```

The `aes` submodule provides authenticated encryption with AES-256-GCM,
delegated to the platform's WebCrypto implementation. The 32-byte `key` is
required; no other modes or key sizes are supported.

Prefer **`seal`/`open`** unless you have a specific reason to manage the IV
yourself. `seal` draws a fresh 12-byte IV from the CSPRNG on every call and
prepends it to the ciphertext (returning `iv || ciphertext`); `open` reads
that IV back off the front and decrypts. This removes the catastrophic
IV-reuse footgun of the raw `encrypt`/`decrypt` pair, where a repeated
`(key, iv)` destroys confidentiality and authenticity (see below).

```js
const { seal, open } = require("@theqrl/qrl-cryptography/aes");
const { getRandomBytesSync } = require("@theqrl/qrl-cryptography/random");
const { utf8ToBytes, bytesToUtf8 } = require("@theqrl/qrl-cryptography/utils");

const key = getRandomBytesSync(32); // 32 bytes for AES-256
const sealed = await seal(utf8ToBytes("message"), key); // iv is generated for you
const plaintext = await open(sealed, key);
console.log(bytesToUtf8(plaintext)); // "message"
```

The raw `encrypt`/`decrypt` pair below additionally require a caller-supplied
12-byte `iv`.

### Encrypting with passwords

AES is not supposed to be used directly with a password. Doing that will
compromise your users' security.

The `key` parameter is meant to be a strong cryptographic key. If you want to
derive one from a password, use a
[key derivation function](https://en.wikipedia.org/wiki/Key_derivation_function)
like [argon2id](#kdfs-argon2id).

### How to use the IV parameter

The `iv` parameter must be **unique per `(key, plaintext)` pair**. Reusing an
IV with the same key destroys both confidentiality and authenticity in
AES-GCM.

Generate a fresh 12-byte IV for every encryption with the `random` module.
Store the IV alongside the ciphertext; you must supply the same IV to
`decrypt`.

### How to handle errors with this module

Sensitive information can be leaked via error messages when using this module.
Catch all errors thrown by `encrypt`/`decrypt` and re-raise them as a single
generic "encryption failure" / "decryption failure" error in your application.

### Example usage

```js
const { encrypt, decrypt } = require("@theqrl/qrl-cryptography/aes");
const { getRandomBytesSync } = require("@theqrl/qrl-cryptography/random");
const { utf8ToBytes, bytesToUtf8 } = require("@theqrl/qrl-cryptography/utils");

const key = getRandomBytesSync(32); // 32 bytes for AES-256
const iv = getRandomBytesSync(12);  // 12 bytes for GCM

const ciphertext = await encrypt(utf8ToBytes("message"), key, iv);
const plaintext = await decrypt(ciphertext, key, iv);
console.log(bytesToUtf8(plaintext)); // "message"
```

## ML-DSA-87

The `ml_dsa87` submodule exports a single object whose methods are:

```ts
const ml_dsa87: {
  keygen(seed?: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array };
  sign(secretKey: Uint8Array, message: Uint8Array, ctx: Uint8Array, randomizedSigning?: boolean): Uint8Array;
  verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array, ctx: Uint8Array): boolean;
};
```

Unlike the other submodules, the ML-DSA-87 functions are namespaced under the
`ml_dsa87` object — call `ml_dsa87.keygen()`, not a bare `keygen()`.

It provides the ML-DSA-87 (FIPS 204) post-quantum digital signature scheme, powered by [`@theqrl/mldsa87`](https://www.npmjs.com/package/@theqrl/mldsa87).

`keygen` draws a fresh seed from the platform CSPRNG when none is supplied,
and wipes that internal seed (best-effort) after key generation. Pass an
explicit `seed` only when you need deterministic key derivation — a seed can
regenerate the keypair, so treat it exactly like the secret key; when you
supply one, you own its lifecycle (wipe it when done).

`sign` is **hedged by default** (FIPS 204 §3.4): fresh CSPRNG randomness is
mixed into each signature's nonce, so the same inputs produce different —
all valid — signature bytes on every call. This frustrates fault-injection
attacks against deterministic signing. Pass `randomizedSigning: false` only
when byte-reproducible signatures are themselves the requirement (test
vectors, deterministic fixtures).

```js
const { ml_dsa87 } = require("@theqrl/qrl-cryptography/ml_dsa87");
const { utf8ToBytes } = require("@theqrl/qrl-cryptography/utils");

// Generate a key pair (random seed)
const { publicKey, secretKey } = ml_dsa87.keygen();

// Sign a message
const ctx = utf8ToBytes("context");
const msg = utf8ToBytes("hello");
const signature = ml_dsa87.sign(secretKey, msg, ctx);

// Verify a signature
const isValid = ml_dsa87.verify(publicKey, msg, signature, ctx);
```

## Browser usage

### Rollup setup

Using this library with Rollup requires the following plugins:

* [`@rollup/plugin-commonjs`](https://www.npmjs.com/package/@rollup/plugin-commonjs)
* [`@rollup/plugin-node-resolve`](https://www.npmjs.com/package/@rollup/plugin-node-resolve)

These can be used by setting your `plugins` array like this:

```js
  plugins: [
    commonjs(),
    resolve({
      browser: true,
      preferBuiltins: false,
    }),
  ]
```

## License

`qrl-cryptography` is released under The MIT License (MIT)

Copyright (c) 2021 Patricio Palladino, Paul Miller, ethereum-cryptography contributors
Copyright (c) 2024 The QRL Contributors

See [LICENSE](./LICENSE) file.