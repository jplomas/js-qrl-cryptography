export declare const ml_dsa87: {
    keygen(seed: Uint8Array): {
        publicKey: Uint8Array;
        secretKey: Uint8Array;
    };
    sign(secretKey: Uint8Array, message: Uint8Array, ctx: Uint8Array): Uint8Array;
    verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array, ctx: Uint8Array): boolean;
};
