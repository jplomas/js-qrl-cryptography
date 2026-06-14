import { getRandomBytesSync } from '../../src/random.js';
import { deepStrictEqual, throws } from './assert.js';

// globalThis.crypto stubbing is exercised only under node: browsers may
// not allow redefining the global, and the real WebCrypto paths are
// covered there by the non-stubbed tests.
const isNode =
  typeof process === 'object' &&
  process !== null &&
  typeof process.versions === 'object' &&
  process.versions !== null &&
  typeof process.versions.node === 'string';
const itIfNode = isNode ? it : it.skip;

type CryptoLike = { getRandomValues?: (arr: Uint8Array) => Uint8Array };

const originalCryptoDesc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

function setCrypto(value: CryptoLike | undefined) {
  Object.defineProperty(globalThis, 'crypto', {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

function restoreCrypto() {
  if (originalCryptoDesc) {
    Object.defineProperty(globalThis, 'crypto', originalCryptoDesc);
  }
}

describe('Random number generation', () => {
  if (isNode) {
    beforeEach(restoreCrypto);
    afterEach(restoreCrypto);
  }

  it('Returns a Uint8Array of the right size', () => {
    deepStrictEqual(getRandomBytesSync(32) instanceof Uint8Array, true);
    deepStrictEqual(getRandomBytesSync(32).length, 32);
    deepStrictEqual(
      getRandomBytesSync(32).some((b) => b !== 0),
      true
    );
  });

  it('Returns an empty Uint8Array for size 0', () => {
    const out = getRandomBytesSync(0);
    deepStrictEqual(out instanceof Uint8Array, true);
    deepStrictEqual(out.length, 0);
  });

  it('Chunks requests above the 64 KiB WebCrypto quota', () => {
    const out = getRandomBytesSync(70000);
    deepStrictEqual(out.length, 70000);
    deepStrictEqual(
      out.some((b) => b !== 0),
      true
    );
  });

  it('Throws on a negative size', () => {
    throws(() => getRandomBytesSync(-1));
  });

  it('Throws on a non-integer size', () => {
    throws(() => getRandomBytesSync(1.5));
  });

  it('Throws on a size above 2^32 - 1', () => {
    throws(() => getRandomBytesSync(0xffffffff + 1));
  });

  itIfNode('Issues one getRandomValues call per 64 KiB chunk', () => {
    const calls: number[] = [];
    setCrypto({
      getRandomValues: (arr: Uint8Array) => {
        calls.push(arr.length);
        arr.fill(0xab);
        return arr;
      },
    });

    const out = getRandomBytesSync(70000);
    deepStrictEqual(calls, [65536, 4464]);
    deepStrictEqual(out[0], 0xab);
    deepStrictEqual(out[out.length - 1], 0xab);
  });

  itIfNode('Trips on all-zero output for requests of 16 bytes or more', () => {
    // Stub returns the buffer untouched (all zeros) — a catastrophically
    // broken platform RNG. The tripwire must refuse to return it.
    setCrypto({ getRandomValues: (arr: Uint8Array) => arr });
    throws(() => getRandomBytesSync(16));
  });

  itIfNode('Does not trip on all-zero output below 16 bytes', () => {
    setCrypto({ getRandomValues: (arr: Uint8Array) => arr });
    const out = getRandomBytesSync(8);
    deepStrictEqual(out.length, 8);
  });

  itIfNode('Throws when no WebCrypto is available', () => {
    setCrypto(undefined);
    throws(() => getRandomBytesSync(32));
  });

  itIfNode('Throws when crypto lacks getRandomValues', () => {
    setCrypto({});
    throws(() => getRandomBytesSync(32));
  });
});
