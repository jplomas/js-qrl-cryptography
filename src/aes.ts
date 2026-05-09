import { crypto } from "./utils.js";

const MODE = "AES-GCM";
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;

function validateOpt(key: Uint8Array, iv: Uint8Array) {
  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(`AES: wrong IV length, expected ${IV_LENGTH_BYTES} bytes`);
  }
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `AES: wrong key length, expected ${KEY_LENGTH_BYTES} bytes`,
    );
  }
}

async function getBrowserKey(
  key: Uint8Array,
  iv: Uint8Array,
): Promise<[CryptoKey, AesGcmParams]> {
  if (!crypto.web) {
    throw new Error("Browser crypto not available.");
  }
  const wKey = await crypto.web.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: MODE, length: key.length * 8 },
    true,
    ["encrypt", "decrypt"],
  );
  return [wKey, { name: MODE, iv: iv as BufferSource, tagLength: 128 }];
}

export async function encrypt(
  msg: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  validateOpt(key, iv);
  if (!crypto.web) {
    throw new Error("The environment doesn't have AES module");
  }
  const [wKey, wOpt] = await getBrowserKey(key, iv);
  const cipher = await crypto.web.subtle.encrypt(
    wOpt,
    wKey,
    msg as BufferSource,
  );
  return new Uint8Array(cipher);
}

export async function decrypt(
  cypherText: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  validateOpt(key, iv);
  if (!crypto.web) {
    throw new Error("The environment doesn't have AES module");
  }
  const [wKey, wOpt] = await getBrowserKey(key, iv);
  const msg = await crypto.web.subtle.decrypt(
    wOpt,
    wKey,
    cypherText as BufferSource,
  );
  return new Uint8Array(msg);
}
