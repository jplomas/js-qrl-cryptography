/**
 * Generate `bytes` cryptographically strong random bytes from the platform
 * WebCrypto CSPRNG. Requests are chunked at the 64 KiB per-call WebCrypto
 * quota, so any size up to 2^32 - 1 works. Throws when no WebCrypto
 * implementation is available — there is no insecure fallback.
 */
export declare function getRandomBytesSync(bytes: number): Uint8Array;
