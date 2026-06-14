'use strict';

var mldsa87 = require('@theqrl/mldsa87');

const MAX_BYTES = 65536;
const MAX_UINT32 = 0xffffffff;
function getWebCrypto() {
    return globalThis.crypto ?? null;
}
/**
 * Generate `bytes` cryptographically strong random bytes from the platform
 * WebCrypto CSPRNG. Requests are chunked at the 64 KiB per-call WebCrypto
 * quota, so any size up to 2^32 - 1 works. Throws when no WebCrypto
 * implementation is available — there is no insecure fallback.
 */
function getRandomBytesSync(bytes) {
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
        throw new RangeError('bytes must be a non-negative integer');
    }
    if (bytes > MAX_UINT32) {
        throw new RangeError('requested too many random bytes');
    }
    if (bytes === 0)
        return new Uint8Array(0);
    const cryptoObj = getWebCrypto();
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
        const out = new Uint8Array(bytes);
        for (let i = 0; i < bytes; i += MAX_BYTES) {
            cryptoObj.getRandomValues(out.subarray(i, Math.min(bytes, i + MAX_BYTES)));
        }
        if (bytes >= 16) {
            // Invariant tripwire: a healthy CSPRNG never returns 16 leading zero
            // bytes (p = 2^-128). All-zero output means the platform RNG is
            // catastrophically broken — refuse to hand it to key generation.
            let acc = 0;
            for (let i = 0; i < 16; i++)
                acc |= out[i];
            if (acc === 0)
                throw new Error('getRandomValues returned all zeros');
        }
        return out;
    }
    throw new Error('Secure random number generation is not supported by this environment');
}

const ml_dsa87 = {
    /**
     * Generate an ML-DSA-87 keypair. When `seed` is omitted, a fresh
     * `SeedBytes`-byte seed is drawn from the platform CSPRNG and wiped
     * (best-effort) after key generation — a seed can deterministically
     * regenerate the keypair, so it is handled exactly like the secret key.
     * When `seed` is supplied, the caller retains ownership and is
     * responsible for wiping it. See SECURITY.md for the limits of
     * zeroization in JavaScript.
     */
    keygen(seed) {
        const pk = new Uint8Array(mldsa87.CryptoPublicKeyBytes);
        const sk = new Uint8Array(mldsa87.CryptoSecretKeyBytes);
        if (seed === undefined) {
            const internalSeed = getRandomBytesSync(mldsa87.SeedBytes);
            try {
                mldsa87.cryptoSignKeypair(internalSeed, pk, sk);
            }
            finally {
                internalSeed.fill(0);
            }
        }
        else {
            mldsa87.cryptoSignKeypair(seed, pk, sk);
        }
        return { publicKey: pk, secretKey: sk };
    },
    /**
     * Sign `message` with `secretKey`. Defaults to hedged signing (FIPS 204
     * §3.4): fresh CSPRNG randomness is mixed into the per-signature nonce,
     * so the same `(secretKey, message, ctx)` produce different — all valid —
     * signature bytes on each call. This frustrates the fault-injection
     * attack class against deterministic signing. Pass
     * `randomizedSigning: false` only when byte-reproducible signatures are
     * themselves the requirement (KAT/ACVP vectors, deterministic fixtures).
     */
    sign(secretKey, message, ctx, randomizedSigning = true) {
        const sig = new Uint8Array(mldsa87.CryptoBytes);
        mldsa87.cryptoSignSignature(sig, message, secretKey, randomizedSigning, ctx);
        return sig;
    },
    verify(publicKey, message, signature, ctx) {
        return mldsa87.cryptoSignVerify(signature, message, publicKey, ctx);
    },
};

exports.ml_dsa87 = ml_dsa87;
