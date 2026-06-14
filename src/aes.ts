import { crypto } from './utils.js';

const MODE = 'AES-GCM';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;

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

function getWebCryptoOrThrow(): Crypto {
  if (!crypto.web) {
    throw new Error("The environment doesn't have AES module");
  }
  return crypto.web;
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
