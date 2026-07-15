import { Keccak } from '@noble/hashes/sha3.js';
import type { ShakeOpts } from '@noble/hashes/sha3.js';
import type { Hash } from '@noble/hashes/utils.js';
interface K256 {
    (data: Uint8Array): Uint8Array;
    create(): Hash<Keccak>;
}
export declare const keccak224: (msg: Uint8Array) => Uint8Array<ArrayBufferLike>;
export declare const keccak256: K256;
export declare const keccak384: (msg: Uint8Array) => Uint8Array<ArrayBufferLike>;
export declare const keccak512: (msg: Uint8Array) => Uint8Array<ArrayBufferLike>;
export declare function shake256(msg: Uint8Array, opts?: ShakeOpts): Uint8Array;
export {};
