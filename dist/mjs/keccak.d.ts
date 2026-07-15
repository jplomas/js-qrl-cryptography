import { Keccak } from '@noble/hashes/sha3.js';
import type { Hash } from '@noble/hashes/utils.js';
interface K256 {
    (data: Uint8Array): Uint8Array;
    create(): Hash<Keccak>;
}
export declare const keccak224: (msg: Uint8Array) => Uint8Array<ArrayBufferLike>;
export declare const keccak256: K256;
export declare const keccak384: (msg: Uint8Array) => Uint8Array<ArrayBufferLike>;
export declare const keccak512: (msg: Uint8Array) => Uint8Array<ArrayBufferLike>;
export declare const shake256: {
    outputLen: number;
    blockLen: number;
    canXOF: boolean;
} & import("@noble/hashes/utils.js").HashInfo & {
    (msg: import("@noble/hashes/utils.js").TArg<Uint8Array>, opts?: import("@noble/hashes/utils.js").TArg<import("@noble/hashes/sha3.js").ShakeOpts> | undefined): import("@noble/hashes/utils.js").TRet<Uint8Array>;
    create(opts?: import("@noble/hashes/sha3.js").ShakeOpts | undefined): Keccak;
} & ((msg: import("@noble/hashes/utils.js").TArg<import("@noble/hashes/utils.js").TArg<Uint8Array<ArrayBufferLike>>>, opts?: import("@noble/hashes/utils.js").TArg<import("@noble/hashes/utils.js").TArg<import("@noble/hashes/sha3.js").ShakeOpts> | undefined>) => Uint8Array<ArrayBufferLike> & Uint8Array<ArrayBuffer>) & {
    outputLen: number;
    blockLen: number;
    canXOF: boolean;
    oid?: import("@noble/hashes/utils.js").TRet<Uint8Array> | undefined;
    create: (opts?: import("@noble/hashes/sha3.js").ShakeOpts | undefined) => Keccak;
};
export {};
