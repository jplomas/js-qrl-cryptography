"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decrypt = exports.encrypt = void 0;
const crypto_1 = require("@noble/hashes/crypto");
const utils_1 = require("./utils");
const crypto = { web: crypto_1.crypto };
function validateOpt(key, iv, mode) {
    if (!mode.startsWith("aes-")) {
        throw new Error(`AES submodule doesn't support mode ${mode}`);
    }
    if (iv.length !== 12) {
        throw new Error("AES: wrong IV length");
    }
    if (mode.startsWith("aes-256") && key.length !== 32) {
        throw new Error("AES: wrong key length");
    }
}
async function getBrowserKey(mode, key, iv) {
    if (!crypto.web) {
        throw new Error("Browser crypto not available.");
    }
    let keyMode;
    if (["aes-256-gcm"].includes(mode)) {
        keyMode = "gcm";
    }
    if (!keyMode) {
        throw new Error("AES: unsupported mode");
    }
    const wKey = await crypto.web.subtle.importKey("raw", key, { name: `AES-${keyMode.toUpperCase()}`, length: key.length * 8 }, true, ["encrypt", "decrypt"]);
    // TODO(rgeraldes24): missing fields
    // node.js uses whole 128 bit as a counter, without nonce, instead of 64 bit
    // recommended by NIST SP800-38A
    return [wKey, { name: `aes-${keyMode}`, iv }];
}
async function encrypt(msg, key, iv, mode = "aes-256-gcm", pkcs7PaddingEnabled = true) {
    validateOpt(key, iv, mode);
    if (crypto.web) {
        const [wKey, wOpt] = await getBrowserKey(mode, key, iv);
        const cipher = await crypto.web.subtle.encrypt(wOpt, wKey, msg);
        let res = new Uint8Array(cipher);
        return res;
    }
    else if (crypto.node) {
        const cipher = crypto.node.createCipheriv(mode, key, iv);
        cipher.setAutoPadding(pkcs7PaddingEnabled);
        return (0, utils_1.concatBytes)(cipher.update(msg), cipher.final());
    }
    else {
        throw new Error("The environment doesn't have AES module");
    }
}
exports.encrypt = encrypt;
async function decrypt(cypherText, key, iv, mode = "aes-256-gcm", pkcs7PaddingEnabled = true) {
    validateOpt(key, iv, mode);
    if (crypto.web) {
        const [wKey, wOpt] = await getBrowserKey(mode, key, iv);
        const msg = await crypto.web.subtle.decrypt(wOpt, wKey, cypherText);
        const msgBytes = new Uint8Array(msg);
        return msgBytes;
    }
    else if (crypto.node) {
        const decipher = crypto.node.createDecipheriv(mode, key, iv);
        decipher.setAutoPadding(pkcs7PaddingEnabled);
        return (0, utils_1.concatBytes)(decipher.update(cypherText), decipher.final());
    }
    else {
        throw new Error("The environment doesn't have AES module");
    }
}
exports.decrypt = decrypt;
