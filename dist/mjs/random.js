import { randomBytes } from "@noble/hashes/utils.js";
export function getRandomBytesSync(bytes) {
    return randomBytes(bytes);
}
