import {
  cryptoSignKeypair,
  cryptoSignSignature,
  cryptoSignVerify,
  CryptoPublicKeyBytes,
  CryptoSecretKeyBytes,
  CryptoBytes,
  SeedBytes,
} from '@theqrl/mldsa87';
import { getRandomBytesSync } from './random.js';

export const ml_dsa87 = {
  /**
   * Generate an ML-DSA-87 keypair. When `seed` is omitted, a fresh
   * `SeedBytes`-byte seed is drawn from the platform CSPRNG and wiped
   * (best-effort) after key generation — a seed can deterministically
   * regenerate the keypair, so it is handled exactly like the secret key.
   * When `seed` is supplied, the caller retains ownership and is
   * responsible for wiping it. See SECURITY.md for the limits of
   * zeroization in JavaScript.
   */
  keygen(seed?: Uint8Array) {
    const pk = new Uint8Array(CryptoPublicKeyBytes);
    const sk = new Uint8Array(CryptoSecretKeyBytes);
    if (seed === undefined) {
      const internalSeed = getRandomBytesSync(SeedBytes);
      try {
        cryptoSignKeypair(internalSeed, pk, sk);
      } finally {
        internalSeed.fill(0);
      }
    } else {
      cryptoSignKeypair(seed, pk, sk);
    }
    return { publicKey: pk, secretKey: sk };
  },
  /**
   * Sign `message` with `secretKey`. Defaults to hedged signing (FIPS 204
   * §3.4): fresh CSPRNG randomness is mixed into the per-signature nonce,
   * so the same `(secretKey, message, ctx)` produce different — all valid —
   * signature bytes on each call. This frustrates the fault-injection
   * attack class against deterministic signing. Pass
   * `randomizedSigning: false` only when byte-reproducible signatures are
   * themselves the requirement (KAT/ACVP vectors, deterministic fixtures).
   */
  sign(secretKey: Uint8Array, message: Uint8Array, ctx: Uint8Array, randomizedSigning = true) {
    const sig = new Uint8Array(CryptoBytes);
    cryptoSignSignature(sig, message, secretKey, randomizedSigning, ctx);
    return sig;
  },
  verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array, ctx: Uint8Array) {
    return cryptoSignVerify(signature, message, publicKey, ctx);
  },
};
