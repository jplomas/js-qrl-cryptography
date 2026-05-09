import { abytes } from "@noble/hashes/utils.js";
declare const assertBytes: typeof abytes;
export { assertBytes };
export { bytesToHex, bytesToHex as toHex, concatBytes, createView, utf8ToBytes, } from "@noble/hashes/utils.js";
/**
 * Decode `data` as UTF-8.
 *
 * By default invalid UTF-8 byte sequences are replaced with `U+FFFD`,
 * matching `Buffer.toString('utf8')` and the `TextDecoder` default. Pass
 * `{ fatal: true }` to throw on invalid input — required when the decoded
 * string is used for security-relevant comparison or hashing, since two
 * distinct invalid byte sequences can otherwise decode to the same string
 * and create hash collisions.
 */
export declare function bytesToUtf8(data: Uint8Array, opts?: {
    fatal?: boolean;
}): string;
export declare function hexToBytes(data: string): Uint8Array;
export declare function wrapHash(hash: (msg: Uint8Array) => Uint8Array): (msg: Uint8Array) => Uint8Array<ArrayBufferLike>;
export declare const crypto: {
    web?: Crypto;
};
