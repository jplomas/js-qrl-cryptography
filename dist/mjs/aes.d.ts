export declare function encrypt(msg: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array>;
export declare function decrypt(cypherText: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array>;
/**
 * Misuse-resistant AES-256-GCM encryption. A fresh 12-byte IV is drawn from
 * the platform CSPRNG for every call and prepended to the ciphertext, so the
 * catastrophic IV-reuse footgun of the raw `encrypt`/`decrypt` API is opt-out
 * rather than opt-in. Use this unless you have a specific reason to manage the
 * IV yourself. Decrypt the result with `open`.
 *
 * The returned buffer is `iv (12 bytes) || ciphertext+tag`.
 */
export declare function seal(msg: Uint8Array, key: Uint8Array): Promise<Uint8Array>;
/**
 * Decrypt a buffer produced by `seal`: the leading 12 bytes are read as the
 * IV and the remainder is authenticated and decrypted. Rejects input too
 * short to contain an IV and a GCM tag before touching WebCrypto.
 */
export declare function open(sealed: Uint8Array, key: Uint8Array): Promise<Uint8Array>;
