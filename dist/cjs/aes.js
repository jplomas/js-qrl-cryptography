'use strict';

// buf.toString('hex') -> toHex(buf)
const crypto = {
    web: typeof globalThis !== "undefined"
        ? globalThis.crypto
        : undefined,
};

const MODE = "AES-GCM";
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
function validateOpt(key, iv) {
    if (iv.length !== IV_LENGTH_BYTES) {
        throw new Error(`AES: wrong IV length, expected ${IV_LENGTH_BYTES} bytes`);
    }
    if (key.length !== KEY_LENGTH_BYTES) {
        throw new Error(`AES: wrong key length, expected ${KEY_LENGTH_BYTES} bytes`);
    }
}
async function getBrowserKey(key, iv) {
    if (!crypto.web) {
        throw new Error("Browser crypto not available.");
    }
    const wKey = await crypto.web.subtle.importKey("raw", key, { name: MODE, length: key.length * 8 }, true, ["encrypt", "decrypt"]);
    return [wKey, { name: MODE, iv: iv, tagLength: 128 }];
}
async function encrypt(msg, key, iv) {
    validateOpt(key, iv);
    if (!crypto.web) {
        throw new Error("The environment doesn't have AES module");
    }
    const [wKey, wOpt] = await getBrowserKey(key, iv);
    const cipher = await crypto.web.subtle.encrypt(wOpt, wKey, msg);
    return new Uint8Array(cipher);
}
async function decrypt(cypherText, key, iv) {
    validateOpt(key, iv);
    if (!crypto.web) {
        throw new Error("The environment doesn't have AES module");
    }
    const [wKey, wOpt] = await getBrowserKey(key, iv);
    const msg = await crypto.web.subtle.decrypt(wOpt, wKey, cypherText);
    return new Uint8Array(msg);
}

exports.decrypt = decrypt;
exports.encrypt = encrypt;
