import {
  cryptoSignKeypair,
  cryptoSignSignature,
  cryptoSignVerify,
  CryptoPublicKeyBytes,
  CryptoSecretKeyBytes,
  CryptoBytes,
  SeedBytes,
} from "@theqrl/mldsa87";
import { getRandomBytesSync } from "./random.js";

export const ml_dsa87 = {
  /**
   * Generate an ML-DSA-87 keypair. When `seed` is omitted, a fresh
   * `SeedBytes`-byte seed is drawn from the platform CSPRNG.
   */
  keygen(seed?: Uint8Array) {
    const pk = new Uint8Array(CryptoPublicKeyBytes);
    const sk = new Uint8Array(CryptoSecretKeyBytes);
    cryptoSignKeypair(seed ?? getRandomBytesSync(SeedBytes), pk, sk);
    return { publicKey: pk, secretKey: sk };
  },
  /**
   * Sign `message` with `secretKey`. Defaults to deterministic signing
   * (FIPS 204 §3.7); pass `randomizedSigning: true` to use the hedged
   * variant for additional side-channel resistance, in which case the
   * underlying implementation draws a fresh nonce from the platform
   * CSPRNG on every call.
   */
  sign(
    secretKey: Uint8Array,
    message: Uint8Array,
    ctx: Uint8Array,
    randomizedSigning = false,
  ) {
    const sig = new Uint8Array(CryptoBytes);
    cryptoSignSignature(sig, message, secretKey, randomizedSigning, ctx);
    return sig;
  },
  verify(
    publicKey: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array,
    ctx: Uint8Array,
  ) {
    return cryptoSignVerify(signature, message, publicKey, ctx);
  },
};
