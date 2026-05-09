'use strict';

var mldsa87 = require('@theqrl/mldsa87');

/**
 * Checks if something is Uint8Array. Be careful: nodejs Buffer will return true.
 * @param a - value to test
 * @returns `true` when the value is a Uint8Array-compatible view.
 * @example
 * Check whether a value is a Uint8Array-compatible view.
 * ```ts
 * isBytes(new Uint8Array([1, 2, 3]));
 * ```
 */
/**
 * Asserts something is a non-negative integer.
 * @param n - number to validate
 * @param title - label included in thrown errors
 * @throws On wrong argument types. {@link TypeError}
 * @throws On wrong argument ranges or values. {@link RangeError}
 * @example
 * Validate a non-negative integer option.
 * ```ts
 * anumber(32, 'length');
 * ```
 */
function anumber(n, title = '') {
    if (typeof n !== 'number') {
        const prefix = title && `"${title}" `;
        throw new TypeError(`${prefix}expected number, got ${typeof n}`);
    }
    if (!Number.isSafeInteger(n) || n < 0) {
        const prefix = title && `"${title}" `;
        throw new RangeError(`${prefix}expected integer >= 0, got ${n}`);
    }
}
/**
 * Cryptographically secure PRNG backed by `crypto.getRandomValues`.
 * @param bytesLength - number of random bytes to generate
 * @returns Random bytes.
 * The platform `getRandomValues()` implementation still defines any
 * single-call length cap, and this helper rejects oversize requests
 * with a stable library `RangeError` instead of host-specific errors.
 * @throws On wrong argument types. {@link TypeError}
 * @throws On wrong argument ranges or values. {@link RangeError}
 * @throws If the current runtime does not provide `crypto.getRandomValues`. {@link Error}
 * @example
 * Generate a fresh random key or nonce.
 * ```ts
 * const key = randomBytes(16);
 * ```
 */
function randomBytes(bytesLength = 32) {
    // Match the repo's other length-taking helpers instead of relying on Uint8Array coercion.
    anumber(bytesLength, 'bytesLength');
    const cr = typeof globalThis === 'object' ? globalThis.crypto : null;
    if (typeof cr?.getRandomValues !== 'function')
        throw new Error('crypto.getRandomValues must be defined');
    // Web Cryptography API Level 2 §10.1.1:
    // if `byteLength > 65536`, throw `QuotaExceededError`.
    // Keep the guard explicit so callers can see the quota in code
    // instead of discovering it by reading the spec or host errors.
    // This wrapper surfaces the same quota as a stable library RangeError.
    if (bytesLength > 65536)
        throw new RangeError(`"bytesLength" expected <= 65536, got ${bytesLength}`);
    return cr.getRandomValues(new Uint8Array(bytesLength));
}

function getRandomBytesSync(bytes) {
    return randomBytes(bytes);
}

const ml_dsa87 = {
    /**
     * Generate an ML-DSA-87 keypair. When `seed` is omitted, a fresh
     * `SeedBytes`-byte seed is drawn from the platform CSPRNG.
     */
    keygen(seed) {
        const pk = new Uint8Array(mldsa87.CryptoPublicKeyBytes);
        const sk = new Uint8Array(mldsa87.CryptoSecretKeyBytes);
        mldsa87.cryptoSignKeypair(seed ?? getRandomBytesSync(mldsa87.SeedBytes), pk, sk);
        return { publicKey: pk, secretKey: sk };
    },
    /**
     * Sign `message` with `secretKey`. Defaults to deterministic signing
     * (FIPS 204 §3.7); pass `randomizedSigning: true` to use the hedged
     * variant for additional side-channel resistance, in which case the
     * underlying implementation draws a fresh nonce from the platform
     * CSPRNG on every call.
     */
    sign(secretKey, message, ctx, randomizedSigning = false) {
        const sig = new Uint8Array(mldsa87.CryptoBytes);
        mldsa87.cryptoSignSignature(sig, message, secretKey, randomizedSigning, ctx);
        return sig;
    },
    verify(publicKey, message, signature, ctx) {
        return mldsa87.cryptoSignVerify(signature, message, publicKey, ctx);
    },
};

exports.ml_dsa87 = ml_dsa87;
