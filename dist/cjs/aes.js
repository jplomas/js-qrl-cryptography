'use strict';

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
function isBytes(a) {
    // Plain `instanceof Uint8Array` is too strict for some Buffer / proxy / cross-realm cases.
    // The fallback still requires a real ArrayBuffer view, so plain
    // JSON-deserialized `{ constructor: ... }` spoofing is rejected, and
    // `BYTES_PER_ELEMENT === 1` keeps the fallback on byte-oriented views.
    return (a instanceof Uint8Array ||
        (ArrayBuffer.isView(a) &&
            a.constructor.name === 'Uint8Array' &&
            'BYTES_PER_ELEMENT' in a &&
            a.BYTES_PER_ELEMENT === 1));
}
/**
 * Asserts something is Uint8Array.
 * @param value - value to validate
 * @param length - optional exact length constraint
 * @param title - label included in thrown errors
 * @returns The validated byte array.
 * @throws On wrong argument types. {@link TypeError}
 * @throws On wrong argument ranges or values. {@link RangeError}
 * @example
 * Validate that a value is a byte array.
 * ```ts
 * abytes(new Uint8Array([1, 2, 3]));
 * ```
 */
function abytes(value, length, title = '') {
    const bytes = isBytes(value);
    const len = value?.length;
    const needsLen = length !== undefined;
    if (!bytes || (needsLen && len !== length)) {
        const prefix = title && `"${title}" `;
        const ofLen = needsLen ? ` of length ${length}` : '';
        const got = bytes ? `length=${len}` : `type=${typeof value}`;
        const message = prefix + 'expected Uint8Array' + ofLen + ', got ' + got;
        if (!bytes)
            throw new TypeError(message);
        throw new RangeError(message);
    }
    return value;
}
/**
 * Copies several Uint8Arrays into one.
 * @param arrays - arrays to concatenate
 * @returns Concatenated byte array.
 * @throws On wrong argument types. {@link TypeError}
 * @example
 * Concatenate multiple byte arrays.
 * ```ts
 * concatBytes(new Uint8Array([1]), new Uint8Array([2]));
 * ```
 */
function concatBytes(...arrays) {
    let sum = 0;
    for (let i = 0; i < arrays.length; i++) {
        const a = arrays[i];
        abytes(a);
        sum += a.length;
    }
    const res = new Uint8Array(sum);
    for (let i = 0, pad = 0; i < arrays.length; i++) {
        const a = arrays[i];
        res.set(a, pad);
        pad += a.length;
    }
    return res;
}

const MAX_BYTES = 65536;
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
    const cryptoObj = getWebCrypto();
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
        const out = new Uint8Array(bytes);
        for (let i = 0; i < bytes; i += MAX_BYTES) {
            cryptoObj.getRandomValues(out.subarray(i, Math.min(bytes, i + MAX_BYTES)));
        }
        return out;
    }
    throw new Error('Secure random number generation is not supported by this environment');
}

// Internal WebCrypto provider seam. It is deliberately NOT part of the
// package's public `exports` map in package.json, so downstream consumers
// cannot import it and same-realm code loaded through the package cannot
// swap the provider at runtime (see CIPH-JSQRLC-4). The binding is kept
// mutable for one reason only: the test suite stubs `crypto.web` to
// exercise the no-WebCrypto error paths in aes.ts.
const crypto = { web: globalThis.crypto };
function getWebCryptoOrThrow() {
    if (!crypto.web) {
        throw new Error("The environment doesn't have AES module");
    }
    return crypto.web;
}

const MODE = 'AES-GCM';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
// AES-GCM appends a 128-bit authentication tag to the ciphertext.
const TAG_LENGTH_BYTES = 16;
function validateOpt(key, iv) {
    if (!(key instanceof Uint8Array)) {
        throw new TypeError('AES: key must be a Uint8Array');
    }
    if (!(iv instanceof Uint8Array)) {
        throw new TypeError('AES: iv must be a Uint8Array');
    }
    if (iv.length !== IV_LENGTH_BYTES) {
        throw new Error(`AES: wrong IV length, expected ${IV_LENGTH_BYTES} bytes`);
    }
    if (key.length !== KEY_LENGTH_BYTES) {
        throw new Error(`AES: wrong key length, expected ${KEY_LENGTH_BYTES} bytes`);
    }
}
async function getWebCryptoKey(web, key, iv) {
    const wKey = await web.subtle.importKey('raw', key, { name: MODE, length: KEY_LENGTH_BYTES * 8 },
    // The caller already holds the raw key bytes; never let the CryptoKey
    // be re-exported from WebCrypto on top of that.
    false, ['encrypt', 'decrypt']);
    return [wKey, { name: MODE, iv: iv, tagLength: 128 }];
}
async function encrypt(msg, key, iv) {
    validateOpt(key, iv);
    const web = getWebCryptoOrThrow();
    const [wKey, wOpt] = await getWebCryptoKey(web, key, iv);
    const cipher = await web.subtle.encrypt(wOpt, wKey, msg);
    return new Uint8Array(cipher);
}
async function decrypt(cypherText, key, iv) {
    validateOpt(key, iv);
    const web = getWebCryptoOrThrow();
    const [wKey, wOpt] = await getWebCryptoKey(web, key, iv);
    const msg = await web.subtle.decrypt(wOpt, wKey, cypherText);
    return new Uint8Array(msg);
}
/**
 * Misuse-resistant AES-256-GCM encryption. A fresh 12-byte IV is drawn from
 * the platform CSPRNG for every call and prepended to the ciphertext, so the
 * catastrophic IV-reuse footgun of the raw `encrypt`/`decrypt` API is opt-out
 * rather than opt-in. Use this unless you have a specific reason to manage the
 * IV yourself. Decrypt the result with `open`.
 *
 * The returned buffer is `iv (12 bytes) || ciphertext+tag`.
 */
async function seal(msg, key) {
    const iv = getRandomBytesSync(IV_LENGTH_BYTES);
    const cipher = await encrypt(msg, key, iv);
    return concatBytes(iv, cipher);
}
/**
 * Decrypt a buffer produced by `seal`: the leading 12 bytes are read as the
 * IV and the remainder is authenticated and decrypted. Rejects input too
 * short to contain an IV and a GCM tag before touching WebCrypto.
 */
async function open(sealed, key) {
    if (!(sealed instanceof Uint8Array)) {
        throw new TypeError('AES: sealed must be a Uint8Array');
    }
    if (sealed.length < IV_LENGTH_BYTES + TAG_LENGTH_BYTES) {
        throw new Error('AES: sealed input is too short to contain an IV and tag');
    }
    const iv = sealed.subarray(0, IV_LENGTH_BYTES);
    const cipher = sealed.subarray(IV_LENGTH_BYTES);
    return decrypt(cipher, key, iv);
}

exports.decrypt = decrypt;
exports.encrypt = encrypt;
exports.open = open;
exports.seal = seal;
