import { keccak_224, keccak_256, keccak_384, keccak_512 } from '@noble/hashes/sha3.js';
import { wrapHash } from './utils.js';
export const keccak224 = wrapHash(keccak_224);
export const keccak256 = Object.assign(wrapHash(keccak_256), {
    create: () => keccak_256.create(),
});
export const keccak384 = wrapHash(keccak_384);
export const keccak512 = wrapHash(keccak_512);
