"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.argon2idSync = exports.argon2id = void 0;
const argon2_1 = require("@noble/hashes/argon2");
const utils_1 = require("./utils");
async function argon2id(password, salt, t, m, p, dkLen, onProgress) {
    (0, utils_1.assertBytes)(password);
    (0, utils_1.assertBytes)(salt);
    return (0, argon2_1.argon2idAsync)(password, salt, { t, m, p, dkLen, onProgress });
}
exports.argon2id = argon2id;
function argon2idSync(password, salt, t, m, p, dkLen, onProgress) {
    (0, utils_1.assertBytes)(password);
    (0, utils_1.assertBytes)(salt);
    return (0, argon2_1.argon2id)(password, salt, { t, m, p, dkLen, onProgress });
}
exports.argon2idSync = argon2idSync;
