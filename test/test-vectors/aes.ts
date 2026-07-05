import { decrypt, encrypt, open, seal } from '../../src/aes.js';
import { hexToBytes, toHex } from '../../src/utils.js';
import { crypto } from '../../src/webcrypto.js';
import { deepStrictEqual, rejects } from './assert.js';
// Test vectors taken from https://github.com/paulmillr/noble-ciphers/blob/main/test/vectors/wycheproof/aes_gcm_test.json
const TEST_VECTORS = [
  {
    key: '80ba3192c803ce965ea371d5ff073cf0f43b6a2ab576b208426e11409c09b9b0',
    iv: '4da5bf8dfd5852c1ea12379d',
    msg: '',
    cypherText: '4771a7c404a472966cea8f73c8bfe17a',
  },
  {
    key: 'cc56b680552eb75008f5484b4cb803fa5063ebd6eab91f6ab6aef4916a766273',
    iv: '99e23ec48985bccdeeab60f1',
    msg: '2a',
    cypherText: '06633c1e9703ef744ffffb40edf9d14355',
  },
  {
    key: '51e4bf2bad92b7aff1a4bc05550ba81df4b96fabf41c12c7b00e60e48db7e152',
    iv: '4f07afedfdc3b6c2361823d3',
    msg: 'be3308f72a2c6aed',
    cypherText: 'cf332a12fdee800b602e8d7c4799d62c140c9bb834876b09',
  },
  {
    key: '67119627bd988eda906219e08c0d0d779a07d208ce8a4fe0709af755eeec6dcb',
    iv: '68ab7fdbf61901dad461d23c',
    msg: '51f8c1f731ea14acdb210a6d973e07',
    cypherText: '43fc101bff4b32bfadd3daf57a590eec04aacb7148a8b8be44cb7eaf4efa69',
  },
];

describe('aes', () => {
  for (const [i, vector] of TEST_VECTORS.entries()) {
    it(`Should encrypt the test ${i} correctly`, async () => {
      const encrypted = await encrypt(hexToBytes(vector.msg), hexToBytes(vector.key), hexToBytes(vector.iv));

      deepStrictEqual(toHex(encrypted), vector.cypherText);
    });

    it(`Should decrypt the test ${i} correctly`, async () => {
      const decrypted = await decrypt(hexToBytes(vector.cypherText), hexToBytes(vector.key), hexToBytes(vector.iv));

      deepStrictEqual(toHex(decrypted), vector.msg);
    });
  }

  it('Should reject IV with length other than 12', async () => {
    await rejects(() =>
      encrypt(
        hexToBytes('abcd'),
        hexToBytes('80ba3192c803ce965ea371d5ff073cf0f43b6a2ab576b208426e11409c09b9b0'),
        hexToBytes('2b7e151628aed2a6abf7158809cf4f3c')
      )
    );
  });

  it('Should reject key with length other than 32', async () => {
    await rejects(() =>
      encrypt(
        hexToBytes('abcd'),
        hexToBytes('2b7e151628aed2a6abf7158809cf4f3c'),
        hexToBytes('4da5bf8dfd5852c1ea12379d')
      )
    );
  });

  it('Should reject a non-Uint8Array key', async () => {
    await rejects(() =>
      encrypt(hexToBytes('abcd'), 'not a key' as unknown as Uint8Array, hexToBytes('4da5bf8dfd5852c1ea12379d'))
    );
  });

  it('Should reject a non-Uint8Array IV', async () => {
    await rejects(() =>
      encrypt(
        hexToBytes('abcd'),
        hexToBytes('80ba3192c803ce965ea371d5ff073cf0f43b6a2ab576b208426e11409c09b9b0'),
        12 as unknown as Uint8Array
      )
    );
  });

  // GCM is an AEAD: any modification of ciphertext or tag must fail
  // authentication. This is the property the mode exists for.
  describe('decrypt rejects tampered inputs (GCM authentication)', () => {
    const vector = TEST_VECTORS[3];
    const key = hexToBytes(vector.key);
    const iv = hexToBytes(vector.iv);

    it('rejects a flipped ciphertext byte', async () => {
      const tampered = hexToBytes(vector.cypherText);
      tampered[0] ^= 1;
      await rejects(() => decrypt(tampered, key, iv));
    });

    it('rejects a flipped authentication-tag byte', async () => {
      const tampered = hexToBytes(vector.cypherText);
      tampered[tampered.length - 1] ^= 1;
      await rejects(() => decrypt(tampered, key, iv));
    });

    it('rejects a ciphertext truncated below the tag length', async () => {
      const truncated = hexToBytes(vector.cypherText).subarray(0, 8);
      await rejects(() => decrypt(truncated, key, iv));
    });

    it('rejects decryption with the wrong key', async () => {
      await rejects(() => decrypt(hexToBytes(vector.cypherText), hexToBytes(TEST_VECTORS[0].key), iv));
    });

    it('rejects decryption with the wrong IV', async () => {
      await rejects(() => decrypt(hexToBytes(vector.cypherText), key, hexToBytes(TEST_VECTORS[0].iv)));
    });
  });

  // seal/open is the misuse-resistant convenience: it generates a fresh IV
  // internally and prepends it to the ciphertext, removing the caller's
  // opportunity to reuse a nonce.
  describe('seal / open (self-contained IV)', () => {
    const key = hexToBytes(TEST_VECTORS[0].key);
    const msg = hexToBytes('be3308f72a2c6aed');

    it('round-trips a message', async () => {
      const sealed = await seal(msg, key);
      const opened = await open(sealed, key);
      deepStrictEqual(toHex(opened), toHex(msg));
    });

    it('prepends a 12-byte IV to the ciphertext', async () => {
      const sealed = await seal(msg, key);
      // 12-byte IV + ciphertext (msg length) + 16-byte GCM tag.
      deepStrictEqual(sealed.length, 12 + msg.length + 16);
    });

    it('uses a fresh IV on every call', async () => {
      const a = await seal(msg, key);
      const b = await seal(msg, key);
      deepStrictEqual(toHex(a) === toHex(b), false);
    });

    it('open rejects a non-Uint8Array sealed input', async () => {
      await rejects(() => open('not bytes' as unknown as Uint8Array, key));
    });

    it('open rejects input too short to contain an IV and tag', async () => {
      await rejects(() => open(new Uint8Array(27), key));
    });

    it('open rejects a tampered sealed blob (GCM authentication)', async () => {
      const sealed = await seal(msg, key);
      sealed[sealed.length - 1] ^= 1;
      await rejects(() => open(sealed, key));
    });
  });

  describe('without WebCrypto', () => {
    const key = hexToBytes(TEST_VECTORS[0].key);
    const iv = hexToBytes(TEST_VECTORS[0].iv);
    let saved: Crypto | undefined;

    beforeEach(() => {
      saved = crypto.web;
      crypto.web = undefined;
    });

    afterEach(() => {
      crypto.web = saved;
    });

    it('encrypt rejects when no WebCrypto is available', async () => {
      await rejects(() => encrypt(hexToBytes('abcd'), key, iv));
    });

    it('decrypt rejects when no WebCrypto is available', async () => {
      await rejects(() => decrypt(hexToBytes(TEST_VECTORS[0].cypherText), key, iv));
    });
  });
});
