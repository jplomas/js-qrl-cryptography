import {
  assertBytes,
  bytesToHex,
  bytesToUtf8,
  concatBytes,
  crypto,
  hexToBytes,
  toHex,
  utf8ToBytes,
} from '../../src/utils.js';
import { deepStrictEqual, throws } from './assert.js';

describe('utils', () => {
  describe('bytesToUtf8', () => {
    it('decodes valid UTF-8', () => {
      deepStrictEqual(bytesToUtf8(utf8ToBytes('abc')), 'abc');
      deepStrictEqual(bytesToUtf8(utf8ToBytes('€ snowman ☃')), '€ snowman ☃');
    });

    it('replaces invalid sequences with U+FFFD by default', () => {
      deepStrictEqual(bytesToUtf8(Uint8Array.from([0x61, 0xff, 0xfe, 0x62])), 'a��b');
    });

    it('throws on invalid sequences with fatal: true', () => {
      throws(() => bytesToUtf8(Uint8Array.from([0xff]), { fatal: true }));
    });

    it('collides distinct invalid inputs without fatal — fatal prevents it', () => {
      // Two different invalid byte sequences decode to the same string in
      // lossy mode (the U+FFFD collision class); fatal mode rejects both.
      const a = Uint8Array.from([0xc0]);
      const b = Uint8Array.from([0xff]);
      deepStrictEqual(bytesToUtf8(a), bytesToUtf8(b));
      throws(() => bytesToUtf8(a, { fatal: true }));
      throws(() => bytesToUtf8(b, { fatal: true }));
    });

    it('throws TypeError on non-Uint8Array input', () => {
      throws(() => bytesToUtf8('abc' as unknown as Uint8Array));
    });
  });

  describe('hexToBytes', () => {
    it('parses plain hex', () => {
      deepStrictEqual(toHex(hexToBytes('deadbeef')), 'deadbeef');
    });

    it('strips 0x and 0X prefixes', () => {
      deepStrictEqual(toHex(hexToBytes('0xdeadbeef')), 'deadbeef');
      deepStrictEqual(toHex(hexToBytes('0Xdeadbeef')), 'deadbeef');
    });

    it('throws on invalid hex', () => {
      throws(() => hexToBytes('0xzz'));
      throws(() => hexToBytes('abc')); // odd length
    });
  });

  describe('re-exported noble helpers', () => {
    it('assertBytes accepts bytes and rejects non-bytes', () => {
      assertBytes(new Uint8Array(1));
      throws(() => assertBytes([1, 2, 3] as unknown as Uint8Array));
    });

    it('concatBytes joins arrays', () => {
      deepStrictEqual(toHex(concatBytes(hexToBytes('dead'), hexToBytes('beef'))), 'deadbeef');
    });

    it('bytesToHex and toHex are the same function', () => {
      deepStrictEqual(bytesToHex === toHex, true);
    });
  });

  describe('crypto shim', () => {
    it('exposes the platform WebCrypto', () => {
      deepStrictEqual(crypto.web !== undefined, true);
    });
  });
});
