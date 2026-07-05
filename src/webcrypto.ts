// Internal WebCrypto provider seam. It is deliberately NOT part of the
// package's public `exports` map in package.json, so downstream consumers
// cannot import it and same-realm code loaded through the package cannot
// swap the provider at runtime (see CIPH-JSQRLC-4). The binding is kept
// mutable for one reason only: the test suite stubs `crypto.web` to
// exercise the no-WebCrypto error paths in aes.ts.
export const crypto: { web?: Crypto } = { web: globalThis.crypto };

export function getWebCryptoOrThrow(): Crypto {
  if (!crypto.web) {
    throw new Error("The environment doesn't have AES module");
  }
  return crypto.web;
}
