import { Keccak, keccak_224, keccak_256, keccak_384, keccak_512 } from '@noble/hashes/sha3.js';
import type { Hash } from '@noble/hashes/utils.js';
import { wrapHash } from './utils.js';

// Expose create only for keccak256
interface K256 {
  (data: Uint8Array): Uint8Array;
  create(): Hash<Keccak>;
}

export const keccak224 = wrapHash(keccak_224);
export const keccak256: K256 = Object.assign(wrapHash(keccak_256), {
  create: () => keccak_256.create(),
});
export const keccak384 = wrapHash(keccak_384);
export const keccak512 = wrapHash(keccak_512);
