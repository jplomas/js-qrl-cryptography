import { argon2id as _sync, argon2idAsync as _async, } from "@noble/hashes/argon2.js";
import { assertBytes } from "./utils.js";
export async function argon2id(password, salt, t, m, p, dkLen, onProgress) {
    assertBytes(password);
    assertBytes(salt);
    return _async(password, salt, { t, m, p, dkLen, onProgress });
}
export function argon2idSync(password, salt, t, m, p, dkLen, onProgress) {
    assertBytes(password);
    assertBytes(salt);
    return _sync(password, salt, { t, m, p, dkLen, onProgress });
}
