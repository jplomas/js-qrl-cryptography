import {
  argon2id as _sync,
  argon2idAsync as _async,
} from "@noble/hashes/argon2.js";
import { assertBytes } from "./utils.js";

type OnProgressCallback = (progress: number) => void;

export async function argon2id(
  password: Uint8Array,
  salt: Uint8Array,
  t: number,
  m: number,
  p: number,
  dkLen: number,
  onProgress?: OnProgressCallback,
): Promise<Uint8Array> {
  assertBytes(password);
  assertBytes(salt);
  return _async(password, salt, { t, m, p, dkLen, onProgress });
}

export function argon2idSync(
  password: Uint8Array,
  salt: Uint8Array,
  t: number,
  m: number,
  p: number,
  dkLen: number,
  onProgress?: OnProgressCallback,
): Uint8Array {
  assertBytes(password);
  assertBytes(salt);
  return _sync(password, salt, { t, m, p, dkLen, onProgress });
}
