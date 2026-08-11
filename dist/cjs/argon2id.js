'use strict';

// Split a JS number into u32 halves without a BigInt allocation. Exact only for integers
// `0 <= n < 2**53`; callers use it on byte / bit counters, which JS length math caps far below
// that (an ArrayBuffer cannot exceed 2**53 - 1 bytes).
const fromNumH = (n) => (n / 2 ** 32) | 0;
const fromNumL = (n) => n >>> 0;
// High 32-bit half of a 64-bit right rotate, valid for `s` in `1..31`.
const rotrSH = (h, l, s) => (h >>> s) | (l << (32 - s));
// Low 32-bit half of a 64-bit right rotate, valid for `s` in `1..31`.
const rotrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
// High 32-bit half of a 64-bit right rotate, valid for `s` in `33..63`; `32` uses `rotr32*`.
const rotrBH = (h, l, s) => (h << (64 - s)) | (l >>> (s - 32));
// Low 32-bit half of a 64-bit right rotate, valid for `s` in `33..63`; `32` uses `rotr32*`.
const rotrBL = (h, l, s) => (h >>> (s - 32)) | (l << (64 - s));
// High 32-bit half of a 64-bit right rotate for `s === 32`; this is just the swapped low half.
const rotr32H = (_h, l) => l;
// Low 32-bit half of a 64-bit right rotate for `s === 32`; this is just the swapped high half.
const rotr32L = (h, _l) => h;
// 64-bit left rotates (rotl*) are not defined here: sha3.ts, their only consumer, keeps
// local copies so V8 inlines them into keccakP.
// Add two split 64-bit words and return the split `{ h, l }` sum.
// JS uses 32-bit signed integers for bitwise operations, so we cannot simply shift the carry out
// of the low sum and instead use division.
function add(Ah, Al, Bh, Bl) {
    const l = (Al >>> 0) + (Bl >>> 0);
    return { h: (Ah + Bh + ((l / 2 ** 32) | 0)) | 0, l: l | 0 };
}
// Addition with more than 2 elements
// Unmasked low-word accumulator for 3-way addition; pass the raw result into `add3H(...)`.
const add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
// High-word finalize step for 3-way addition; `low` must be the untruncated output of `add3L(...)`.
const add3H = (low, Ah, Bh, Ch) => (Ah + Bh + Ch + ((low / 2 ** 32) | 0)) | 0;

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
// Shared error-message prefix builder. Only called on throw paths, so assert
// success paths never pay for the string concatenation.
const atitle = (title) => (title ? `"${title}" ` : '');
/**
 * Asserts something is a non-negative integer.
 * @param n - number to validate
 * @param title - label included in thrown errors
 * @returns The validated number.
 * @throws On wrong argument types. {@link TypeError}
 * @throws On wrong argument ranges or values. {@link RangeError}
 * @example
 * Validate a non-negative integer option.
 * ```ts
 * anumber(32, 'length');
 * ```
 */
function anumber(n, title = '') {
    if (typeof n !== 'number')
        throw new TypeError(atitle(title) + 'expected number, got ' + typeof n);
    if (!Number.isSafeInteger(n) || n < 0)
        throw new RangeError(atitle(title) + 'expected integer >= 0, got ' + n);
    return n;
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
    // Success path first: this runs at the start of every update() / digestInto(), and the
    // common `abytes(data)` form must not pay for length handling it does not use.
    if (isBytes(value) && (length === undefined || value.length === length))
        return value;
    // Error path: recompute freely to build the exact message.
    if (length !== undefined)
        anumber(length, 'length');
    const bytes = isBytes(value);
    const ofLen = length !== undefined ? ` of length ${length}` : '';
    const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
    const message = atitle(title) + 'expected Uint8Array' + ofLen + ', got ' + got;
    if (!bytes)
        throw new TypeError(message);
    throw new RangeError(message);
}
/**
 * Copies bytes into a fresh Uint8Array.
 * Buffer-style slices can alias the same backing store, so callers that need ownership should copy.
 * @param bytes - source bytes to clone
 * @returns Freshly allocated copy of `bytes`.
 * @throws On wrong argument types. {@link TypeError}
 * @example
 * Clone a byte array before mutating it.
 * ```ts
 * const copy = copyBytes(new Uint8Array([1, 2, 3]));
 * ```
 */
function copyBytes(bytes) {
    // `Uint8Array.from(...)` would also accept arrays / other typed arrays. Keep this helper strict
    // because callers use it at byte-validation boundaries before mutating the detached copy.
    return Uint8Array.from(abytes(bytes));
}
const aobject = (value, label) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError((label === 'object' ? '' : `"${label}" `) + 'expected object, got type=' + typeof value);
};
/**
 * Asserts a hash instance has not been destroyed or finished.
 * @param instance - hash instance to validate
 * @param checkFinished - whether to reject finalized instances
 * @throws If the hash instance has already been destroyed or finalized. {@link Error}
 * @example
 * Validate that a hash instance is still usable.
 * ```ts
 * import { aexists } from '@noble/hashes/utils.js';
 * import { sha256 } from '@noble/hashes/sha2.js';
 * const hash = sha256.create();
 * aexists(hash);
 * ```
 */
function aexists(instance, checkFinished = true) {
    // Runs on every update()/digestInto(); the flags are library-owned booleans, so only their
    // truthiness is checked - re-validating their type per call was pure hot-path overhead.
    if (instance.destroyed)
        throw new Error('hash was destroyed');
    if (checkFinished && instance.finished)
        throw new Error('digest() was already called');
}
/**
 * Asserts output is a sufficiently-sized byte array.
 * @param out - destination buffer
 * @param instance - hash instance providing output length
 * Oversized buffers are allowed; downstream code only promises to fill the first `outputLen` bytes.
 * @throws On wrong argument types. {@link TypeError}
 * @throws On wrong argument ranges or values. {@link RangeError}
 * @example
 * Validate a caller-provided digest buffer.
 * ```ts
 * import { aoutput } from '@noble/hashes/utils.js';
 * import { sha256 } from '@noble/hashes/sha2.js';
 * const hash = sha256.create();
 * aoutput(new Uint8Array(hash.outputLen), hash);
 * ```
 */
function aoutput(out, instance) {
    abytes(out, undefined, 'output');
    // `outputLen` is a library-owned readonly number; the negated comparison keeps failing fast
    // when it is missing/NaN (comparisons with undefined/NaN are false) without an anumber() call.
    const min = instance.outputLen;
    if (!(out.length >= min)) {
        throw new RangeError('"output" expected length >= ' + min);
    }
}
/**
 * Casts a typed array view to Uint8Array.
 * @param arr - source typed array
 * @returns Uint8Array view over the same buffer.
 * @example
 * Reinterpret a typed array as bytes.
 * ```ts
 * u8(new Uint32Array([1, 2]));
 * ```
 */
function u8(arr) {
    return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}
/**
 * Casts a typed array view to Uint32Array.
 * `arr.byteOffset` must already be 4-byte aligned or the platform
 * Uint32Array constructor will throw.
 * @param arr - source typed array
 * @returns Uint32Array view over the same buffer.
 * @example
 * Reinterpret a byte array as 32-bit words.
 * ```ts
 * u32(new Uint8Array(8));
 * ```
 */
function u32(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
/**
 * Zeroizes typed arrays in place. Warning: JS provides no guarantees.
 * @param arrays - arrays to overwrite with zeros
 * @example
 * Zeroize sensitive buffers in place.
 * ```ts
 * clean(new Uint8Array([1, 2, 3]));
 * ```
 */
function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
        arrays[i].fill(0);
    }
}
/** Whether the current platform is little-endian. */
const isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44)();
/**
 * Byte-swap operation for uint32 values.
 * @param word - source word
 * @returns Word with reversed byte order.
 * @example
 * Reverse the byte order of a 32-bit word.
 * ```ts
 * byteSwap(0x11223344);
 * ```
 */
function byteSwap(word) {
    return (((word << 24) & 0xff000000) |
        ((word << 8) & 0xff0000) |
        ((word >>> 8) & 0xff00) |
        ((word >>> 24) & 0xff));
}
/**
 * Conditionally byte-swaps one 32-bit word on big-endian platforms.
 * @param n - source word
 * @returns Original or byte-swapped word depending on platform endianness.
 * @example
 * Normalize a 32-bit word for host endianness.
 * ```ts
 * swap8IfBE(0x11223344);
 * ```
 */
const swap8IfBE = isLE
    ? (n) => n
    : (n) => byteSwap(n) >>> 0;
/**
 * Byte-swaps every word of a Uint32Array in place.
 * @param arr - array to mutate
 * @returns The same array after mutation; callers pass live state arrays here.
 * @example
 * Reverse the byte order of every word in place.
 * ```ts
 * byteSwap32(new Uint32Array([0x11223344]));
 * ```
 */
function byteSwap32(arr) {
    for (let i = 0; i < arr.length; i++) {
        arr[i] = byteSwap(arr[i]);
    }
    return arr;
}
/**
 * Conditionally byte-swaps a Uint32Array on big-endian platforms.
 * @param u - array to normalize for host endianness
 * @returns Original or byte-swapped array depending on platform endianness.
 *   On big-endian runtimes this mutates `u` in place via `byteSwap32(...)`.
 * @example
 * Normalize a word array for host endianness.
 * ```ts
 * swap32IfBE(new Uint32Array([0x11223344]));
 * ```
 */
const swap32IfBE = isLE
    ? (u) => u
    : byteSwap32;
/**
 * There is no setImmediate in browser and setTimeout is slow.
 * This yields to the Promise/microtask scheduler queue, not to timers or the
 * full macrotask event loop.
 * @example
 * Yield to the next scheduler tick.
 * ```ts
 * await nextTick();
 * ```
 */
const nextTick = async () => { };
/**
 * Converts string to bytes using UTF8 encoding.
 * Built-in doesn't validate input to be string: we do the check.
 * Non-ASCII details are delegated to the platform `TextEncoder`.
 * @param str - string to encode
 * @returns UTF-8 encoded bytes.
 * @throws On wrong argument types. {@link TypeError}
 * @example
 * Encode a string as UTF-8 bytes.
 * ```ts
 * utf8ToBytes('abc'); // Uint8Array.from([97, 98, 99])
 * ```
 */
function utf8ToBytes(str) {
    if (typeof str !== 'string')
        throw new TypeError('string expected');
    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
}
/**
 * Helper for KDFs: consumes Uint8Array or string.
 * String inputs are UTF-8 encoded; byte-array inputs stay aliased to the caller buffer.
 * @param data - user-provided KDF input
 * @param errorTitle - label included in thrown errors
 * @returns Byte representation of the input.
 * @throws On wrong argument types. {@link TypeError}
 * @example
 * Normalize KDF input to bytes.
 * ```ts
 * kdfInputToBytes('password');
 * ```
 */
function kdfInputToBytes(data, errorTitle = '') {
    if (typeof data === 'string')
        return utf8ToBytes(data);
    return abytes(data, undefined, errorTitle);
}
/**
 * Merges default options and passed options.
 * @param defaults - base option object
 * @param opts - user overrides
 * @param title - label included in thrown override errors
 * @returns Merged option object. The merge mutates `defaults` in place.
 * @throws On wrong argument types. {@link TypeError}
 * @example
 * Merge user overrides onto default options.
 * ```ts
 * checkOpts({ dkLen: 32 }, { asyncTick: 10 });
 * ```
 */
function checkOpts(defaults, opts, title = 'opts') {
    aobject(defaults, 'defaults');
    if (opts !== undefined)
        aobject(opts, title);
    const merged = Object.assign(defaults, opts);
    return merged;
}
/**
 * Creates a callable hash function from a stateful class constructor.
 * @param hashCons - hash constructor or factory
 * @param info - optional metadata such as DER OID
 * @returns Frozen callable hash wrapper with `.create()`.
 *   Wrapper construction eagerly calls `hashCons(undefined)` once to read
 *   `outputLen` / `blockLen`, so constructor side effects happen at module
 *   init time.
 * @throws On wrong argument types. {@link TypeError}
 * @example
 * Wrap a stateful hash constructor into a callable helper.
 * ```ts
 * import { createHasher } from '@noble/hashes/utils.js';
 * import { sha256 } from '@noble/hashes/sha2.js';
 * const wrapped = createHasher(sha256.create, { oid: sha256.oid });
 * wrapped(new Uint8Array([1]));
 * ```
 */
function createHasher(hashCons, info = {}) {
    if (typeof hashCons !== 'function')
        throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
    info = checkOpts({}, info, 'info');
    const hashC = (msg, opts) => hashCons(opts)
        .update(msg)
        .digest();
    const tmp = hashCons(undefined);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.canXOF = tmp.canXOF;
    hashC.create = (opts) => hashCons(opts);
    Object.assign(hashC, info);
    return Object.freeze(hashC);
}

/**
 * Internal helpers for blake hash.
 * @module
 */
// Unrealized speed-up: a file-local copy of rotr measured ~1-2% faster blake2s/blake256/blake3
// on Node 24 (V8 does not inline it into G1s/G2s across the module boundary). Reused from
// utils for deduplication.
/**
 * Internal blake permutation table.
 * Rows `0..9` serve BLAKE2s, rows `0..11` serve BLAKE2b with `10..11 = 0..1`, and Blake1 also
 * reuses the later rows shown below. Blake1 expands rounds `10..15` as `SIGMA[i % 10]`, so rows
 * `10..15` intentionally repeat rows `0..5` for the 14-round (256) and 16-round (512) variants.
 */
// prettier-ignore
const BSIGMA = /* @__PURE__ */ Uint8Array.from([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
    11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4,
    7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8,
    9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13,
    2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9,
    12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11,
    13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10,
    6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5,
    10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
    // Blake1, unused in others
    11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4,
    7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8,
    9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13,
    2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9,
]);

/**
 * blake2b (64-bit) & blake2s (8 to 32-bit) hash functions.
 * b could have been faster, but there is no fast u64 in js, so s is 1.5x faster.
 * @module
 */
// Same IV words as `SHA512_IV`, but endian-swapped into LE u32 low/high halves
// for the BLAKE2b u64 helpers below.
const B2B_IV = /* @__PURE__ */ Uint32Array.from([
    0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85, 0xfe94f82b, 0x3c6ef372, 0x5f1d36f1, 0xa54ff53a,
    0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c, 0xfb41bd6b, 0x1f83d9ab, 0x137e2179, 0x5be0cd19,
]);
// Shared synchronous BLAKE2b work vector as LE u32 low/high halves.
const BBUF = /* @__PURE__ */ new Uint32Array(32);
// BLAKE2b G mix split into two half-rounds over LE u32 low/high limbs.
function G1b(a, b, c, d, msg, x) {
    // NOTE: V is LE here
    const Xl = msg[x], Xh = msg[x + 1]; // prettier-ignore
    let Al = BBUF[2 * a], Ah = BBUF[2 * a + 1]; // prettier-ignore
    let Bl = BBUF[2 * b], Bh = BBUF[2 * b + 1]; // prettier-ignore
    let Cl = BBUF[2 * c], Ch = BBUF[2 * c + 1]; // prettier-ignore
    let Dl = BBUF[2 * d], Dh = BBUF[2 * d + 1]; // prettier-ignore
    // v[a] = (v[a] + v[b] + x) | 0;
    const ll = add3L(Al, Bl, Xl);
    Ah = add3H(ll, Ah, Bh, Xh);
    Al = ll | 0;
    // v[d] = rotr(v[d] ^ v[a], 32)
    let xh = Dh ^ Ah, xl = Dl ^ Al; // prettier-ignore
    Dh = rotr32H(xh, xl);
    Dl = rotr32L(xh);
    // v[c] = (v[c] + v[d]) | 0;
    ({ h: Ch, l: Cl } = add(Ch, Cl, Dh, Dl));
    // v[b] = rotr(v[b] ^ v[c], 24)
    xh = Bh ^ Ch;
    xl = Bl ^ Cl;
    Bh = rotrSH(xh, xl, 24);
    Bl = rotrSL(xh, xl, 24);
    BBUF[2 * a] = Al;
    BBUF[2 * a + 1] = Ah;
    BBUF[2 * b] = Bl;
    BBUF[2 * b + 1] = Bh;
    BBUF[2 * c] = Cl;
    BBUF[2 * c + 1] = Ch;
    BBUF[2 * d] = Dl;
    BBUF[2 * d + 1] = Dh;
}
// Second half-round of the same LE-limb BLAKE2b G mix; `x` is the message word offset.
function G2b(a, b, c, d, msg, x) {
    // NOTE: V is LE here
    const Xl = msg[x], Xh = msg[x + 1]; // prettier-ignore
    let Al = BBUF[2 * a], Ah = BBUF[2 * a + 1]; // prettier-ignore
    let Bl = BBUF[2 * b], Bh = BBUF[2 * b + 1]; // prettier-ignore
    let Cl = BBUF[2 * c], Ch = BBUF[2 * c + 1]; // prettier-ignore
    let Dl = BBUF[2 * d], Dh = BBUF[2 * d + 1]; // prettier-ignore
    // v[a] = (v[a] + v[b] + x) | 0;
    const ll = add3L(Al, Bl, Xl);
    Ah = add3H(ll, Ah, Bh, Xh);
    Al = ll | 0;
    // v[d] = rotr(v[d] ^ v[a], 16)
    let xh = Dh ^ Ah, xl = Dl ^ Al; // prettier-ignore
    Dh = rotrSH(xh, xl, 16);
    Dl = rotrSL(xh, xl, 16);
    // v[c] = (v[c] + v[d]) | 0;
    ({ h: Ch, l: Cl } = add(Ch, Cl, Dh, Dl));
    // v[b] = rotr(v[b] ^ v[c], 63)
    xh = Bh ^ Ch;
    xl = Bl ^ Cl;
    Bh = rotrBH(xh, xl, 63);
    Bl = rotrBL(xh, xl, 63);
    BBUF[2 * a] = Al;
    BBUF[2 * a + 1] = Ah;
    BBUF[2 * b] = Bl;
    BBUF[2 * b + 1] = Bh;
    BBUF[2 * c] = Cl;
    BBUF[2 * c + 1] = Ch;
    BBUF[2 * d] = Dl;
    BBUF[2 * d + 1] = Dh;
}
function checkBlake2Opts(outputLen, opts = {}, keyLen, saltLen, persLen) {
    anumber(keyLen);
    // RFC 7693 §2.1 requires digest length nn in 1..keyLen (keyLen doubles as
    // the per-variant max for both key and digest lengths: 64 for b, 32 for s).
    if (outputLen <= 0 || outputLen > keyLen)
        throw new Error('"dkLen" must be 1..' + keyLen + ', got ' + outputLen);
    const { key, salt, personalization } = opts;
    // This API uses `undefined` for the RFC 7693 `kk = 0` case, so a provided key must be non-empty.
    if (key !== undefined && (key.length < 1 || key.length > keyLen))
        throw new Error('"key" expected to be undefined or of length=1..' + keyLen);
    if (salt !== undefined)
        abytes(salt, saltLen, 'salt');
    if (personalization !== undefined)
        abytes(personalization, persLen, 'personalization');
}
/** Internal base class for BLAKE2. */
class _BLAKE2 {
    buffer;
    buffer32;
    finished = false;
    destroyed = false;
    length = 0;
    pos = 0;
    blockLen;
    outputLen;
    canXOF = false;
    constructor(blockLen, outputLen) {
        anumber(blockLen);
        anumber(outputLen);
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.buffer = new Uint8Array(blockLen);
        this.buffer32 = u32(this.buffer);
    }
    update(data) {
        aexists(this);
        abytes(data);
        // Main difference with other hashes: there is flag for last block,
        // so we cannot process current block before we know that there
        // is the next one. This significantly complicates logic and reduces ability
        // to do zero-copy processing
        const { blockLen, buffer, buffer32 } = this;
        const len = data.length;
        const offset = data.byteOffset;
        const buf = data.buffer;
        for (let pos = 0; pos < len;) {
            // If buffer is full and we still have input (don't process last block, same as blake2s)
            if (this.pos === blockLen) {
                swap32IfBE(buffer32);
                this.compress(buffer32, 0, false);
                swap32IfBE(buffer32);
                this.pos = 0;
            }
            const take = Math.min(blockLen - this.pos, len - pos);
            const dataOffset = offset + pos;
            // Zero-copy only for full, 4-byte-aligned, non-final blocks.
            if (take === blockLen && !(dataOffset % 4) && pos + take < len) {
                const data32 = new Uint32Array(buf, dataOffset, Math.floor((len - pos) / 4));
                swap32IfBE(data32);
                for (let pos32 = 0; pos + blockLen < len; pos32 += buffer32.length, pos += blockLen) {
                    this.length += blockLen;
                    this.compress(data32, pos32, false);
                }
                swap32IfBE(data32);
                continue;
            }
            // When the whole input is buffered in one go (common for short messages), passing `data`
            // directly avoids allocating a subarray view.
            buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
            this.pos += take;
            this.length += take;
            pos += take;
        }
        return this;
    }
    digestInto(out) {
        aexists(this);
        aoutput(out, this);
        // Reject unaligned views explicitly instead of hiding them behind a full scratch copy.
        if (out.byteOffset & 3)
            throw new RangeError('"output" expected 4-byte aligned byteOffset, got ' + out.byteOffset);
        const { pos, buffer32 } = this;
        this.finished = true;
        // Padding
        this.buffer.fill(0, pos);
        swap32IfBE(buffer32);
        this.compress(buffer32, 0, true);
        swap32IfBE(buffer32);
        const state = this.get();
        // digest() passes our own `buffer` as `out`; reuse its cached u32 view instead of allocating.
        const out32 = out === this.buffer ? buffer32 : u32(out);
        const full = Math.floor(this.outputLen / 4);
        for (let i = 0; i < full; i++)
            out32[i] = swap8IfBE(state[i]);
        const tail = this.outputLen % 4;
        if (!tail)
            return;
        const off = full * 4;
        const word = state[full];
        for (let i = 0; i < tail; i++)
            out[off + i] = word >>> (8 * i);
    }
    digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        // Return a copy so callers do not alias the instance scratch buffer used during finalization.
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
    }
    _cloneInto(to) {
        const { buffer, length, finished, destroyed, outputLen, pos } = this;
        // Recreate only `dkLen`; key/salt/personalization are already absorbed into the copied state.
        to ||= new this.constructor({ dkLen: outputLen });
        to.set(...this.get());
        // Last-block-aware lazy compression keeps the pending block live even when full.
        to.buffer.set(buffer);
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        // @ts-ignore
        to.outputLen = outputLen;
        return to;
    }
    clone() {
        return this._cloneInto();
    }
}
/** Internal blake2b hash class with state stored as LE u32 low/high halves. */
class _BLAKE2b extends _BLAKE2 {
    // Same IV words as SHA-512 / BLAKE2b, encoded as LE u32 low/high halves.
    v0l = B2B_IV[0] | 0;
    v0h = B2B_IV[1] | 0;
    v1l = B2B_IV[2] | 0;
    v1h = B2B_IV[3] | 0;
    v2l = B2B_IV[4] | 0;
    v2h = B2B_IV[5] | 0;
    v3l = B2B_IV[6] | 0;
    v3h = B2B_IV[7] | 0;
    v4l = B2B_IV[8] | 0;
    v4h = B2B_IV[9] | 0;
    v5l = B2B_IV[10] | 0;
    v5h = B2B_IV[11] | 0;
    v6l = B2B_IV[12] | 0;
    v6h = B2B_IV[13] | 0;
    v7l = B2B_IV[14] | 0;
    v7h = B2B_IV[15] | 0;
    constructor(opts = {}) {
        opts = checkOpts({}, opts);
        const olen = opts.dkLen === undefined ? 64 : opts.dkLen;
        super(128, olen);
        checkBlake2Opts(olen, opts, 64, 16, 16);
        let { key, personalization, salt } = opts;
        let keyLength = 0;
        if (key !== undefined) {
            abytes(key, undefined, 'key');
            keyLength = key.length;
        }
        // RFC 7693 §2.5: xor `p[0] = 0x0101kknn` into the low 32 bits of `h[0]`;
        // the high 32 bits stay at `IV[0]`.
        this.v0l ^= this.outputLen | (keyLength << 8) | (0x01 << 16) | (0x01 << 24);
        if (salt !== undefined) {
            abytes(salt, undefined, 'salt');
            // Copy: u32() would throw on views with byteOffset not divisible by 4.
            const slt = u32(copyBytes(salt));
            this.v4l ^= swap8IfBE(slt[0]);
            this.v4h ^= swap8IfBE(slt[1]);
            this.v5l ^= swap8IfBE(slt[2]);
            this.v5h ^= swap8IfBE(slt[3]);
        }
        if (personalization !== undefined) {
            abytes(personalization, undefined, 'personalization');
            // Copy: u32() would throw on views with byteOffset not divisible by 4.
            const pers = u32(copyBytes(personalization));
            this.v6l ^= swap8IfBE(pers[0]);
            this.v6h ^= swap8IfBE(pers[1]);
            this.v7l ^= swap8IfBE(pers[2]);
            this.v7h ^= swap8IfBE(pers[3]);
        }
        if (key !== undefined) {
            // Pad to blockLen and update
            const tmp = new Uint8Array(this.blockLen);
            tmp.set(key);
            this.update(tmp);
            // The padded copy holds key material; buffer/state keep what they need.
            clean(tmp);
        }
    }
    // prettier-ignore
    get() {
        let { v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h } = this;
        return [v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h];
    }
    // prettier-ignore
    set(v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h) {
        this.v0l = v0l | 0;
        this.v0h = v0h | 0;
        this.v1l = v1l | 0;
        this.v1h = v1h | 0;
        this.v2l = v2l | 0;
        this.v2h = v2h | 0;
        this.v3l = v3l | 0;
        this.v3h = v3h | 0;
        this.v4l = v4l | 0;
        this.v4h = v4h | 0;
        this.v5l = v5l | 0;
        this.v5h = v5h | 0;
        this.v6l = v6l | 0;
        this.v6h = v6h | 0;
        this.v7l = v7l | 0;
        this.v7h = v7h | 0;
    }
    compress(msg, offset, isLast) {
        // First half from state. Direct writes: get() would allocate an array +
        // closure per block.
        // prettier-ignore
        const { v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h } = this;
        // prettier-ignore
        {
            BBUF[0] = v0l;
            BBUF[1] = v0h;
            BBUF[2] = v1l;
            BBUF[3] = v1h;
            BBUF[4] = v2l;
            BBUF[5] = v2h;
            BBUF[6] = v3l;
            BBUF[7] = v3h;
            BBUF[8] = v4l;
            BBUF[9] = v4h;
            BBUF[10] = v5l;
            BBUF[11] = v5h;
            BBUF[12] = v6l;
            BBUF[13] = v6h;
            BBUF[14] = v7l;
            BBUF[15] = v7h;
        }
        BBUF.set(B2B_IV, 16); // Second half from IV.
        const l = fromNumL(this.length);
        const h = fromNumH(this.length);
        BBUF[24] = B2B_IV[8] ^ l; // Low word of the offset.
        BBUF[25] = B2B_IV[9] ^ h; // High word.
        // Invert all bits for last block
        if (isLast) {
            BBUF[28] = ~BBUF[28];
            BBUF[29] = ~BBUF[29];
        }
        let j = 0;
        const s = BSIGMA;
        // SIGMA selects 64-bit message words; multiply by 2 because `msg` stores
        // each word as [low32, high32].
        for (let i = 0; i < 12; i++) {
            G1b(0, 4, 8, 12, msg, offset + 2 * s[j++]);
            G2b(0, 4, 8, 12, msg, offset + 2 * s[j++]);
            G1b(1, 5, 9, 13, msg, offset + 2 * s[j++]);
            G2b(1, 5, 9, 13, msg, offset + 2 * s[j++]);
            G1b(2, 6, 10, 14, msg, offset + 2 * s[j++]);
            G2b(2, 6, 10, 14, msg, offset + 2 * s[j++]);
            G1b(3, 7, 11, 15, msg, offset + 2 * s[j++]);
            G2b(3, 7, 11, 15, msg, offset + 2 * s[j++]);
            G1b(0, 5, 10, 15, msg, offset + 2 * s[j++]);
            G2b(0, 5, 10, 15, msg, offset + 2 * s[j++]);
            G1b(1, 6, 11, 12, msg, offset + 2 * s[j++]);
            G2b(1, 6, 11, 12, msg, offset + 2 * s[j++]);
            G1b(2, 7, 8, 13, msg, offset + 2 * s[j++]);
            G2b(2, 7, 8, 13, msg, offset + 2 * s[j++]);
            G1b(3, 4, 9, 14, msg, offset + 2 * s[j++]);
            G2b(3, 4, 9, 14, msg, offset + 2 * s[j++]);
        }
        this.v0l ^= BBUF[0] ^ BBUF[16];
        this.v0h ^= BBUF[1] ^ BBUF[17];
        this.v1l ^= BBUF[2] ^ BBUF[18];
        this.v1h ^= BBUF[3] ^ BBUF[19];
        this.v2l ^= BBUF[4] ^ BBUF[20];
        this.v2h ^= BBUF[5] ^ BBUF[21];
        this.v3l ^= BBUF[6] ^ BBUF[22];
        this.v3h ^= BBUF[7] ^ BBUF[23];
        this.v4l ^= BBUF[8] ^ BBUF[24];
        this.v4h ^= BBUF[9] ^ BBUF[25];
        this.v5l ^= BBUF[10] ^ BBUF[26];
        this.v5h ^= BBUF[11] ^ BBUF[27];
        this.v6l ^= BBUF[12] ^ BBUF[28];
        this.v6h ^= BBUF[13] ^ BBUF[29];
        this.v7l ^= BBUF[14] ^ BBUF[30];
        this.v7h ^= BBUF[15] ^ BBUF[31];
        clean(BBUF);
    }
    destroy() {
        this.destroyed = true;
        clean(this.buffer32);
        this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }
}
/**
 * Blake2b hash function. 64-bit. 1.5x slower than blake2s in JS.
 * @param msg - message that would be hashed
 * @param opts - Optional output, MAC, salt, and personalization settings.
 *   `dkLen` must be 1..64 bytes; `salt` and `personalization`, if present,
 *   must be 16 bytes each. See {@link Blake2Opts}.
 * @returns Digest bytes.
 * @example
 * Hash a message with Blake2b.
 * ```ts
 * blake2b(new Uint8Array([97, 98, 99]));
 * ```
 * @example
 * Hash a message with Blake2b while selecting output, MAC, salt, and personalization settings.
 * ```ts
 * blake2b(new Uint8Array([97, 98, 99]), {
 *   dkLen: 32,
 *   key: new Uint8Array(32),
 *   salt: new Uint8Array(16),
 *   personalization: new Uint8Array(16),
 * });
 * ```
 */
const blake2b = /* @__PURE__ */ createHasher((opts) => new _BLAKE2b(opts));

/**
 * Argon2 KDF from RFC 9106. Can be used to create a key from password and salt.
 * We suggest to use Scrypt. JS Argon is 2-10x slower than native code because of 64-bitness:
 * * argon uses uint64, but JS doesn't have fast uint64array
 * * uint64 multiplication is 1/3 of time
 * * `P` function would be very nice with u64, because most of value will be in registers,
 *   hovewer with u32 it will require 32 registers, which is too much.
 * * JS arrays do slow bound checks, so reading from `A2_BUF` slows it down
 * @module
 */
// RFC 9106 §3.1 type `y`: 0 = Argon2d, 1 = Argon2i, 2 = Argon2id. The numeric values are the
// spec-bound part here; the object keys are internal labels.
const AT = { Argon2d: 0, Argon2i: 1, Argon2id: 2 };
// RFC 9106 sync points constant `SL = 4`, fixed by the design rather than exposed as a tuning knob.
const ARGON2_SYNC_POINTS = 4;
// Preserve Argon2's `LE32(len(X)) || X` encoding for omitted
// optional fields by emitting empty bytes.
const abytesOrZero = (buf, errorTitle = '') => {
    if (buf === undefined)
        return Uint8Array.of();
    return kdfInputToBytes(buf, errorTitle);
};
// Unsigned `u32 * u32 = { h, l }`, returned as split 64-bit halves.
function mul(a, b) {
    // Split into 16-bit limbs so each partial product stays exact under `Math.imul`.
    const aL = a & 0xffff;
    const aH = a >>> 16;
    const bL = b & 0xffff;
    const bH = b >>> 16;
    const ll = Math.imul(aL, bL);
    const hl = Math.imul(aH, bL);
    const lh = Math.imul(aL, bH);
    const hh = Math.imul(aH, bH);
    const carry = (ll >>> 16) + (hl & 0xffff) + lh;
    const high = (hh + (hl >>> 16) + (carry >>> 16)) | 0;
    const low = (carry << 16) | (ll & 0xffff);
    return { h: high, l: low };
}
// High 32 bits of unsigned u32 multiply, via the same 16-bit limb split as `mul` below.
// Kept single-purpose and number-returning so V8 inlines it (object-returning
// helpers here cost 2.2x of the whole derivation, measured; small helpers
// returning one number are free — see rotr* usage everywhere).
function mulHi(a, b) {
    const aL = a & 0xffff, aH = a >>> 16, bL = b & 0xffff, bH = b >>> 16; // prettier-ignore
    const carry = (Math.imul(aL, bL) >>> 16) + (Math.imul(aH, bL) & 0xffff) + Math.imul(aL, bH);
    return (Math.imul(aH, bH) + (Math.imul(aH, bL) >>> 16) + (carry >>> 16)) | 0;
}
// Temporary block buffer.
// 1024-byte block: 256 u32 = 128 interleaved low/high halves = RFC's
// 8x8 matrix of 16-byte registers.
const A2_BUF = new Uint32Array(256);
// Quarter-round over 64-bit word indices into `A2_BUF`; each index maps to adjacent low/high u32s.
// Each BlaMka step `X = X + Y + 2 * trunc(X) * trunc(Y)` (trunc = low 32 bits) is three lines:
// `Math.imul` is the low product half, `mulHi` the high half, then a split 64-bit add with the
// doubling folded in. RFC 9106 Figure 19 GB rotates by 32, 24, 16, and 63 bits after each XOR.
function G(a, b, c, d) {
    let Al = A2_BUF[2 * a], Ah = A2_BUF[2 * a + 1]; // prettier-ignore
    let Bl = A2_BUF[2 * b], Bh = A2_BUF[2 * b + 1]; // prettier-ignore
    let Cl = A2_BUF[2 * c], Ch = A2_BUF[2 * c + 1]; // prettier-ignore
    let Dl = A2_BUF[2 * d], Dh = A2_BUF[2 * d + 1]; // prettier-ignore
    let ml = 0, mh = 0, rl = 0, xh = 0, xl = 0; // prettier-ignore
    // A = blamka(A, B); D = rotr64(D ^ A, 32)
    ml = Math.imul(Al, Bl);
    mh = mulHi(Al, Bl); // prettier-ignore
    rl = (Al >>> 0) + (Bl >>> 0) + ((ml << 1) >>> 0);
    Ah = (Ah + Bh + ((mh << 1) | (ml >>> 31)) + ((rl / 0x100000000) | 0)) | 0;
    Al = rl | 0; // prettier-ignore
    xh = Dh ^ Ah;
    xl = Dl ^ Al; // prettier-ignore
    Dh = rotr32H(xh, xl);
    Dl = rotr32L(xh); // prettier-ignore
    // C = blamka(C, D); B = rotr64(B ^ C, 24)
    ml = Math.imul(Cl, Dl);
    mh = mulHi(Cl, Dl); // prettier-ignore
    rl = (Cl >>> 0) + (Dl >>> 0) + ((ml << 1) >>> 0);
    Ch = (Ch + Dh + ((mh << 1) | (ml >>> 31)) + ((rl / 0x100000000) | 0)) | 0;
    Cl = rl | 0; // prettier-ignore
    xh = Bh ^ Ch;
    xl = Bl ^ Cl; // prettier-ignore
    Bh = rotrSH(xh, xl, 24);
    Bl = rotrSL(xh, xl, 24); // prettier-ignore
    // A = blamka(A, B); D = rotr64(D ^ A, 16)
    ml = Math.imul(Al, Bl);
    mh = mulHi(Al, Bl); // prettier-ignore
    rl = (Al >>> 0) + (Bl >>> 0) + ((ml << 1) >>> 0);
    Ah = (Ah + Bh + ((mh << 1) | (ml >>> 31)) + ((rl / 0x100000000) | 0)) | 0;
    Al = rl | 0; // prettier-ignore
    xh = Dh ^ Ah;
    xl = Dl ^ Al; // prettier-ignore
    Dh = rotrSH(xh, xl, 16);
    Dl = rotrSL(xh, xl, 16); // prettier-ignore
    // C = blamka(C, D); B = rotr64(B ^ C, 63)
    ml = Math.imul(Cl, Dl);
    mh = mulHi(Cl, Dl); // prettier-ignore
    rl = (Cl >>> 0) + (Dl >>> 0) + ((ml << 1) >>> 0);
    Ch = (Ch + Dh + ((mh << 1) | (ml >>> 31)) + ((rl / 0x100000000) | 0)) | 0;
    Cl = rl | 0; // prettier-ignore
    xh = Bh ^ Ch;
    xl = Bl ^ Cl; // prettier-ignore
    Bh = rotrBH(xh, xl, 63);
    Bl = rotrBL(xh, xl, 63); // prettier-ignore
    ((A2_BUF[2 * a] = Al), (A2_BUF[2 * a + 1] = Ah));
    ((A2_BUF[2 * b] = Bl), (A2_BUF[2 * b + 1] = Bh));
    ((A2_BUF[2 * c] = Cl), (A2_BUF[2 * c + 1] = Ch));
    ((A2_BUF[2 * d] = Dl), (A2_BUF[2 * d + 1] = Dh));
}
// Argon2 permutation over 16 register indices into `A2_BUF`, not the register values themselves.
// RFC 9106 Figure 17: these arguments are the 16 `v0..v15` 64-bit word
// indices inside eight 16-byte inputs, not copied word values.
// prettier-ignore
function P(v00, v01, v02, v03, v04, v05, v06, v07, v08, v09, v10, v11, v12, v13, v14, v15) {
    // RFC 9106 Figure 18: first apply GB across rows, then across columns of the 8x8 register matrix.
    G(v00, v04, v08, v12);
    G(v01, v05, v09, v13);
    G(v02, v06, v10, v14);
    G(v03, v07, v11, v15);
    G(v00, v05, v10, v15);
    G(v01, v06, v11, v12);
    G(v02, v07, v08, v13);
    G(v03, v04, v09, v14);
}
function block(x, xPos, yPos, outPos, needXor) {
    for (let i = 0; i < 256; i++)
        A2_BUF[i] = x[xPos + i] ^ x[yPos + i];
    // rows (8 consecutive 16-register groups)
    for (let i = 0; i < 128; i += 16) {
        // prettier-ignore
        P(i, i + 1, i + 2, i + 3, i + 4, i + 5, i + 6, i + 7, i + 8, i + 9, i + 10, i + 11, i + 12, i + 13, i + 14, i + 15);
    }
    // columns (8 strided 16-register groups)
    for (let i = 0; i < 16; i += 2) {
        // prettier-ignore
        P(i, i + 1, i + 16, i + 17, i + 32, i + 33, i + 48, i + 49, i + 64, i + 65, i + 80, i + 81, i + 96, i + 97, i + 112, i + 113);
    }
    // RFC 9106 step 6: passes after the first XOR the old destination block into the new G(X, Y).
    if (needXor)
        for (let i = 0; i < 256; i++)
            x[outPos + i] ^= A2_BUF[i] ^ x[xPos + i] ^ x[yPos + i];
    else
        for (let i = 0; i < 256; i++)
            x[outPos + i] = A2_BUF[i] ^ x[xPos + i] ^ x[yPos + i];
    clean(A2_BUF);
}
// Variable-Length Hash Function H'
// Returns bytes, not words; 1024-byte block callers explicitly reinterpret with `u32(...)`.
function Hp(A, dkLen) {
    const A8 = u8(A);
    const T = new Uint32Array(1);
    const T8 = u8(T);
    // Argon2 H' prefixes dkLen as LE32; native Uint32Array writes would serialize as BE on s390x.
    T[0] = swap8IfBE(dkLen);
    // Fast path
    if (dkLen <= 64)
        return blake2b.create({ dkLen }).update(T8).update(A8).digest();
    const out = new Uint8Array(dkLen);
    let V = blake2b.create({}).update(T8).update(A8).digest();
    let pos = 0;
    // RFC 9106 Figure 8: each intermediate `V_i` contributes only `W_i`, its first 32 bytes; only
    // `V_{r+1}` is emitted in full at the remaining length.
    out.set(V.subarray(0, 32));
    pos += 32;
    // Rest blocks
    for (; dkLen - pos > 64; pos += 32) {
        const Vh = blake2b.create({}).update(V);
        Vh.digestInto(V);
        Vh.destroy();
        out.set(V.subarray(0, 32), pos);
    }
    // Last block
    out.set(blake2b(V, { dkLen: dkLen - pos }), pos);
    clean(V, T);
    // H' is byte-oriented; returning `u32(out)` would silently drop dkLen % 4 tail bytes.
    return out;
}
// Used only inside argon2Blocks!
function indexAlpha(r, s, laneLen, segmentLen, index, randL, sameLane = false) {
    // RFC 9106 §3.4.2 Figures 12-13: map `J1` / `J2` into the current lane's reference area `W`.
    let area;
    if (r === 0) {
        if (s === 0)
            area = index - 1;
        else if (sameLane)
            area = s * segmentLen + index - 1;
        else
            area = s * segmentLen + (index == 0 ? -1 : 0);
    }
    else if (sameLane)
        area = laneLen - segmentLen + index - 1;
    else
        area = laneLen - segmentLen + (index == 0 ? -1 : 0);
    const startPos = r !== 0 && s !== ARGON2_SYNC_POINTS - 1 ? (s + 1) * segmentLen : 0;
    // RFC 9106 Figure 13: `mul(randL, randL).h` is `floor(J_1^2 / 2^32)`, and the outer high-half
    // multiply computes `floor(|W| * x / 2^32)` without floating-point math.
    const rel = area - 1 - mul(area, mul(randL, randL).h).h;
    return (startPos + rel) % laneLen;
}
// Exclusive `2^32` sentinel used by `isU32(...)`, not the inclusive maximum u32 value.
const maxUint32 = Math.pow(2, 32);
// Validate safe JS integers in `[0, 2^32 - 1]`.
function isU32(num) {
    return Number.isSafeInteger(num) && num >= 0 && num < maxUint32;
}
function argon2Opts(opts) {
    opts = checkOpts({}, opts);
    const merged = {
        version: 0x13,
        dkLen: 32,
        maxmem: maxUint32 - 1,
        asyncTick: 10,
    };
    // Unknown keys are copied through unchanged here and later ignored unless
    // destructuring consumes them.
    for (let [k, v] of Object.entries(opts))
        if (v !== undefined)
            merged[k] = v;
    const { dkLen, p, m, t, version, onProgress, asyncTick } = merged;
    // RFC 9106 §3.1: tag length `T` MUST be an integer number of bytes from 4 to 2^32-1.
    if (!isU32(dkLen) || dkLen < 4)
        throw new Error('"dkLen" must be 4..');
    if (!isU32(p) || p < 1 || p >= Math.pow(2, 24))
        throw new Error('"p" must be 1..2^24');
    if (!isU32(m))
        throw new Error('"m" must be 0..2^32');
    if (!isU32(t) || t < 1)
        throw new Error('"t" (iterations) must be 1..2^32');
    if (onProgress !== undefined && typeof onProgress !== 'function')
        throw new Error('"onProgress" must be a function');
    anumber(asyncTick, 'asyncTick');
    /*
    Memory size m MUST be an integer number of kibibytes from 8*p
    to 2^(32)-1. The actual number of blocks is m', which is m
    rounded down to the nearest multiple of 4*p.
    */
    if (!isU32(m) || m < 8 * p)
        throw new Error('"m" (memory) must be at least 8*p bytes');
    // Accept legacy `0x10` for compatibility even though RFC 9106 profiles standardize `0x13`.
    if (version !== 0x10 && version !== 0x13)
        throw new Error('"version" must be 0x10 or 0x13, got ' + version);
    return merged;
}
function argon2Init(password, salt, type, opts) {
    password = kdfInputToBytes(password, 'password');
    salt = kdfInputToBytes(salt, 'salt');
    if (!isU32(password.length))
        throw new Error('"password" must be less of length 1..4Gb');
    // RFC 9106 §3.1 only requires S <= 2^32-1 bytes and says 16 bytes is RECOMMENDED for password
    // hashing; this library intentionally takes the stricter common >=8-byte salt path.
    if (!isU32(salt.length) || salt.length < 8)
        throw new Error('"salt" must be of length 8..4Gb');
    if (!Object.values(AT).includes(type))
        throw new Error('"type" was invalid');
    let { p, dkLen, m, t, version, key, personalization, maxmem, onProgress, asyncTick } = argon2Opts(opts);
    // Validation
    key = abytesOrZero(key, 'key');
    personalization = abytesOrZero(personalization, 'personalization');
    // H_0 = H^(64)(LE32(p) || LE32(T) || LE32(m) || LE32(t) ||
    //       LE32(v) || LE32(y) || LE32(length(P)) || P ||
    //       LE32(length(S)) || S ||  LE32(length(K)) || K ||
    //       LE32(length(X)) || X)
    const h = blake2b.create();
    const BUF = new Uint32Array(1);
    const BUF8 = u8(BUF);
    for (let item of [p, dkLen, m, t, version, type]) {
        // RFC 9106 H0 encodes these scalars as LE32, so normalize the host word before exposing bytes.
        BUF[0] = swap8IfBE(item);
        h.update(BUF8);
    }
    for (let i of [password, salt, key, personalization]) {
        BUF[0] = swap8IfBE(i.length); // BUF is u32 array, this is valid once normalized to LE bytes
        h.update(BUF8).update(i);
    }
    // Reserve two extra LE32 words after the 64-byte `H_0` so Figures 3-4 can append
    // `LE32(0 or 1) || LE32(i)` in place for the lane-starting blocks.
    const H0 = new Uint32Array(18);
    const H0_8 = u8(H0);
    h.digestInto(H0_8);
    // 256 u32 = 1024 (BLOCK_SIZE), fills A2_BUF on processing
    // Params
    const lanes = p;
    // m' = 4 * p * floor (m / 4p)
    const mP = 4 * p * Math.floor(m / (ARGON2_SYNC_POINTS * p));
    //q = m' / p columns
    const laneLen = Math.floor(mP / p);
    const segmentLen = Math.floor(laneLen / ARGON2_SYNC_POINTS);
    // `maxmem` is documented in bytes; compare against the actual 1024-byte block allocation.
    const memUsed = mP * 1024;
    if (!isU32(maxmem))
        throw new Error('"maxmem" expected <2**32, got ' + maxmem);
    if (memUsed > maxmem)
        throw new Error('"maxmem" limit was hit: memUsed(mP*1024)=' + memUsed + ', maxmem=' + maxmem);
    const B = new Uint32Array(memUsed / 4);
    // Fill first blocks
    for (let l = 0; l < p; l++) {
        const i = 256 * laneLen * l;
        // B[i][0] = H'^(1024)(H_0 || LE32(0) || LE32(i))
        H0[17] = swap8IfBE(l);
        H0[16] = swap8IfBE(0);
        B.set(swap32IfBE(u32(Hp(H0, 1024))), i);
        // B[i][1] = H'^(1024)(H_0 || LE32(1) || LE32(i))
        H0[16] = swap8IfBE(1);
        B.set(swap32IfBE(u32(Hp(H0, 1024))), i + 256);
    }
    let perBlock = () => { };
    if (onProgress) {
        // The first segment of the first pass skips two preinitialized blocks per lane.
        const totalBlock = t * ARGON2_SYNC_POINTS * p * segmentLen - 2 * p;
        // Invoke callback if progress changes from 10.01 to 10.02
        // Allows to draw smooth progress bar on up to 8K screen
        const callbackPer = Math.max(Math.floor(totalBlock / 10000), 1);
        let blockCnt = 0;
        perBlock = () => {
            blockCnt++;
            if (onProgress && (!(blockCnt % callbackPer) || blockCnt === totalBlock))
                onProgress(blockCnt / totalBlock);
        };
    }
    clean(BUF, H0);
    return { type, mP, p, t, version, B, laneLen, lanes, segmentLen, dkLen, perBlock, asyncTick };
}
function argon2Output(B, p, laneLen, dkLen) {
    const B_final = new Uint32Array(256);
    for (let l = 0; l < p; l++)
        for (let j = 0; j < 256; j++)
            B_final[j] ^= B[256 * (laneLen * l + laneLen - 1) + j];
    // RFC 9106 steps 7-8 feed the byte string `C` into `H'^T(C)`, so normalize the xor'ed words
    // back to spec byte order before `Hp(...)` reinterprets them as bytes.
    const res = Hp(swap32IfBE(B_final), dkLen);
    // Wipe both the xor scratch and the full working matrix once final digest bytes exist.
    // JS cleanup is still only best-effort, but this local buffer is no longer needed here.
    clean(B, B_final);
    return res;
}
/**
 * Fills every Argon2 block for all passes / slices / lanes, yielding once per
 * processed block so callers control pacing: the sync driver just drains the
 * generator, while the async driver awaits `nextTick()` between time slices.
 */
function* argon2Blocks(ctx) {
    const { type, mP, p, t, version, B, laneLen, lanes, segmentLen, perBlock } = ctx;
    // [address, input, zero_block] format so we can pass single U32 to block function
    const address = new Uint32Array(3 * 256);
    address[256 + 6] = mP;
    address[256 + 8] = t;
    address[256 + 10] = type;
    for (let r = 0; r < t; r++) {
        // RFC 9106 step 6 applies the XOR-on-later-passes rule only for version `0x13`; legacy
        // `0x10` keeps the older overwrite behavior used by the v16 test vectors.
        const needXor = r !== 0 && version === 0x13;
        address[256 + 0] = r;
        for (let s = 0; s < ARGON2_SYNC_POINTS; s++) {
            address[256 + 4] = s;
            // RFC 9106 §3.4.1.3: Argon2id uses Argon2i's data-independent `J1` / `J2` generation only
            // in pass 0, slices 0 and 1; Argon2i uses it in every segment.
            const dataIndependent = type == AT.Argon2i || (type == AT.Argon2id && r === 0 && s < 2);
            for (let l = 0; l < p; l++) {
                address[256 + 2] = l;
                address[256 + 12] = 0;
                let startPos = 0;
                if (r === 0 && s === 0) {
                    startPos = 2;
                    if (dataIndependent) {
                        address[256 + 12]++;
                        block(address, 256, 2 * 256, 0, false);
                        block(address, 0, 2 * 256, 0, false);
                    }
                }
                // current block position
                let offset = l * laneLen + s * segmentLen + startPos;
                for (let index = startPos; index < segmentLen; index++, offset++) {
                    perBlock();
                    // Previous block position: wraps to the lane's last block only at lane start,
                    // which can happen here only for the first block of slice 0 on passes > 0.
                    const prev = offset % laneLen ? offset - 1 : offset + laneLen - 1;
                    let randL, randH;
                    if (dataIndependent) {
                        let i128 = index % 128;
                        // RFC 9106 §3.4.1.2: each 1024-byte address block yields 128 `(J1, J2)` pairs, so
                        // regenerate it whenever the segment index crosses a multiple of 128.
                        if (i128 === 0) {
                            address[256 + 12]++;
                            block(address, 256, 2 * 256, 0, false);
                            block(address, 0, 2 * 256, 0, false);
                        }
                        randL = address[2 * i128];
                        randH = address[2 * i128 + 1];
                    }
                    else {
                        const T = 256 * prev;
                        randL = B[T];
                        randH = B[T + 1];
                    }
                    // Address-block path selects `J1` / `J2`, then maps them to the reference
                    // lane/block per RFC 9106 §3.4.
                    const refLane = r === 0 && s === 0 ? l : randH % lanes;
                    const refPos = indexAlpha(r, s, laneLen, segmentLen, index, randL, refLane == l);
                    const refBlock = laneLen * refLane + refPos;
                    // B[i][j] = G(B[i][j-1], B[l][z])
                    block(B, 256 * prev, 256 * refBlock, offset * 256, needXor);
                    yield;
                }
            }
        }
    }
    clean(address);
}
function argon2(type, password, salt, opts) {
    const ctx = argon2Init(password, salt, type, opts);
    const blocks = argon2Blocks(ctx);
    while (!blocks.next().done) { }
    return argon2Output(ctx.B, ctx.p, ctx.laneLen, ctx.dkLen);
}
/**
 * Argon2id, combining i+d, the most popular version from RFC 9106.
 * @param password - password or input key material
 * @param salt - unique salt value
 * @param opts - Argon2 cost and optional tuning parameters. See {@link ArgonOpts}.
 * @returns Derived key bytes.
 * @throws If the Argon2 input or cost parameters are invalid. {@link Error}
 * @example
 * Derive a key with Argon2id.
 * ```ts
 * argon2id('password', 'salt1234', { t: 1, m: 8, p: 1, dkLen: 32 });
 * ```
 */
const argon2id$1 = (password, salt, opts) => argon2(AT.Argon2id, password, salt, opts);
async function argon2Async(type, password, salt, opts) {
    const ctx = argon2Init(password, salt, type, opts);
    const blocks = argon2Blocks(ctx);
    let ts = Date.now();
    while (!blocks.next().done) {
        // Date.now() is not monotonic. If the clock goes backwards,
        // still yield control.
        const diff = Date.now() - ts;
        if (diff >= 0 && diff < ctx.asyncTick)
            continue;
        await nextTick();
        ts += diff;
    }
    return argon2Output(ctx.B, ctx.p, ctx.laneLen, ctx.dkLen);
}
/**
 * Argon2id async, combining i+d, the most popular version from RFC 9106.
 * @param password - password or input key material
 * @param salt - unique salt value
 * @param opts - Argon2 cost and optional tuning parameters. See {@link ArgonOpts}.
 * @returns Promise resolving to derived key bytes.
 * @throws If the Argon2 input or cost parameters are invalid. {@link Error}
 * @example
 * Derive a key with Argon2id asynchronously.
 * ```ts
 * await argon2idAsync('password', 'salt1234', { t: 1, m: 8, p: 1, dkLen: 32 });
 * ```
 */
const argon2idAsync = (password, salt, opts) => argon2Async(AT.Argon2id, password, salt, opts);

const assertBytes = abytes;

async function argon2id(password, salt, t, m, p, dkLen, onProgress) {
    assertBytes(password);
    assertBytes(salt);
    return argon2idAsync(password, salt, { t, m, p, dkLen, onProgress });
}
function argon2idSync(password, salt, t, m, p, dkLen, onProgress) {
    assertBytes(password);
    assertBytes(salt);
    return argon2id$1(password, salt, { t, m, p, dkLen, onProgress });
}

exports.argon2id = argon2id;
exports.argon2idSync = argon2idSync;
