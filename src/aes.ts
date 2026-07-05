import { concatBytes } from './utils.js';
import { getRandomBytesSync } from './random.js';
import { getWebCryptoOrThrow } from './webcrypto.js';

const MODE = 'AES-GCM';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
// AES-GCM appends a 128-bit authentication tag to the ciphertext.
const TAG_LENGTH_BYTES = 16;

function validateOpt(key: Uint8Array, iv: Uint8Array) {
  if (!(key instanceof Uint8Array)) {
    throw new TypeError('AES: key must be a Uint8Array');
  }
  if (!(iv instanceof Uint8Array)) {
    throw new TypeError('AES: iv must be a Uint8Array');
  }
  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(`AES: wrong IV length, expected ${IV_LENGTH_BYTES} bytes`);
  }
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(`AES: wrong key length, expected ${KEY_LENGTH_BYTES} bytes`);
  }
}

async function getWebCryptoKey(web: Crypto, key: Uint8Array, iv: Uint8Array): Promise<[CryptoKey, AesGcmParams]> {
  const wKey = await web.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: MODE, length: KEY_LENGTH_BYTES * 8 },
    // The caller already holds the raw key bytes; never let the CryptoKey
    // be re-exported from WebCrypto on top of that.
    false,
    ['encrypt', 'decrypt']
  );
  return [wKey, { name: MODE, iv: iv as BufferSource, tagLength: 128 }];
}

export async function encrypt(msg: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  validateOpt(key, iv);
  const web = getWebCryptoOrThrow();
  const [wKey, wOpt] = await getWebCryptoKey(web, key, iv);
  const cipher = await web.subtle.encrypt(wOpt, wKey, msg as BufferSource);
  return new Uint8Array(cipher);
}

export async function decrypt(cypherText: Uint8Array, key: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  validateOpt(key, iv);
  const web = getWebCryptoOrThrow();
  const [wKey, wOpt] = await getWebCryptoKey(web, key, iv);
  const msg = await web.subtle.decrypt(wOpt, wKey, cypherText as BufferSource);
  return new Uint8Array(msg);
}

/**
 * Misuse-resistant AES-256-GCM encryption. A fresh 12-byte IV is drawn from
 * the platform CSPRNG for every call and prepended to the ciphertext, so the
 * catastrophic IV-reuse footgun of the raw `encrypt`/`decrypt` API is opt-out
 * rather than opt-in. Use this unless you have a specific reason to manage the
 * IV yourself. Decrypt the result with `open`.
 *
 * The returned buffer is `iv (12 bytes) || ciphertext+tag`.
 */
export async function seal(msg: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
  const iv = getRandomBytesSync(IV_LENGTH_BYTES);
  const cipher = await encrypt(msg, key, iv);
  return concatBytes(iv, cipher);
}

/**
 * Decrypt a buffer produced by `seal`: the leading 12 bytes are read as the
 * IV and the remainder is authenticated and decrypted. Rejects input too
 * short to contain an IV and a GCM tag before touching WebCrypto.
 */
export async function open(sealed: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
  if (!(sealed instanceof Uint8Array)) {
    throw new TypeError('AES: sealed must be a Uint8Array');
  }
  if (sealed.length < IV_LENGTH_BYTES + TAG_LENGTH_BYTES) {
    throw new Error('AES: sealed input is too short to contain an IV and tag');
  }
  const iv = sealed.subarray(0, IV_LENGTH_BYTES);
  const cipher = sealed.subarray(IV_LENGTH_BYTES);
  return decrypt(cipher, key, iv);
}
