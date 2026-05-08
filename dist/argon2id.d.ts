type OnProgressCallback = (progress: number) => void;
export declare function argon2id(password: Uint8Array, salt: Uint8Array, t: number, m: number, p: number, dkLen: number, onProgress?: OnProgressCallback): Promise<Uint8Array>;
export declare function argon2idSync(password: Uint8Array, salt: Uint8Array, t: number, m: number, p: number, dkLen: number, onProgress?: OnProgressCallback): Uint8Array;
export {};
