import { randomBytes } from "@noble/hashes/utils.js";

export function getRandomBytesSync(bytes: number): Uint8Array {
  return randomBytes(bytes);
}
