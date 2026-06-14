import { crypto } from './utils.js';
const MODE = 'AES-GCM';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
function validateOpt(key, iv) {
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
function getWebCryptoOrThrow() {
    if (!crypto.web) {
        throw new Error("The environment doesn't have AES module");
    }
    return crypto.web;
}
async function getWebCryptoKey(web, key, iv) {
    const wKey = await web.subtle.importKey('raw', key, { name: MODE, length: KEY_LENGTH_BYTES * 8 }, 
    // The caller already holds the raw key bytes; never let the CryptoKey
    // be re-exported from WebCrypto on top of that.
    false, ['encrypt', 'decrypt']);
    return [wKey, { name: MODE, iv: iv, tagLength: 128 }];
}
export async function encrypt(msg, key, iv) {
    validateOpt(key, iv);
    const web = getWebCryptoOrThrow();
    const [wKey, wOpt] = await getWebCryptoKey(web, key, iv);
    const cipher = await web.subtle.encrypt(wOpt, wKey, msg);
    return new Uint8Array(cipher);
}
export async function decrypt(cypherText, key, iv) {
    validateOpt(key, iv);
    const web = getWebCryptoOrThrow();
    const [wKey, wOpt] = await getWebCryptoKey(web, key, iv);
    const msg = await web.subtle.decrypt(wOpt, wKey, cypherText);
    return new Uint8Array(msg);
}
