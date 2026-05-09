export declare const ml_dsa87: {
    /**
     * Generate an ML-DSA-87 keypair. When `seed` is omitted, a fresh
     * `SeedBytes`-byte seed is drawn from the platform CSPRNG.
     */
    keygen(seed?: Uint8Array): {
        publicKey: Uint8Array<ArrayBuffer>;
        secretKey: Uint8Array<ArrayBuffer>;
    };
    /**
     * Sign `message` with `secretKey`. Defaults to deterministic signing
     * (FIPS 204 §3.7); pass `randomizedSigning: true` to use the hedged
     * variant for additional side-channel resistance, in which case the
     * underlying implementation draws a fresh nonce from the platform
     * CSPRNG on every call.
     */
    sign(secretKey: Uint8Array, message: Uint8Array, ctx: Uint8Array, randomizedSigning?: boolean): Uint8Array<ArrayBuffer>;
    verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array, ctx: Uint8Array): boolean;
};
