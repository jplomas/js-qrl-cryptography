import { hexToBytes as _hexToBytes, abytes } from '@noble/hashes/utils.js';
const assertBytes = abytes;
export { assertBytes };
export { bytesToHex, bytesToHex as toHex, concatBytes, createView, utf8ToBytes } from '@noble/hashes/utils.js';

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
export function bytesToUtf8(data: Uint8Array, opts: { fatal?: boolean } = {}): string {
  if (!(data instanceof Uint8Array)) {
    throw new TypeError(`bytesToUtf8 expected Uint8Array, got ${typeof data}`);
  }
  return new TextDecoder('utf-8', { fatal: opts.fatal === true }).decode(data);
}

export function hexToBytes(data: string): Uint8Array {
  const sliced = data.startsWith('0x') || data.startsWith('0X') ? data.substring(2) : data;
  return _hexToBytes(sliced);
}

// Internal utils
export function wrapHash(hash: (msg: Uint8Array) => Uint8Array) {
  return (msg: Uint8Array) => {
    abytes(msg);
    return hash(msg);
  };
}
