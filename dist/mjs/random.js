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
export function getRandomBytesSync(bytes) {
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
