"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ml_dsa87 = void 0;
const mldsa87_1 = require("@theqrl/mldsa87");
exports.ml_dsa87 = {
    keygen(seed) {
        const pk = new Uint8Array(mldsa87_1.CryptoPublicKeyBytes);
        const sk = new Uint8Array(mldsa87_1.CryptoSecretKeyBytes);
        (0, mldsa87_1.cryptoSignKeypair)(seed, pk, sk);
        return { publicKey: pk, secretKey: sk };
    },
    sign(secretKey, message, ctx) {
        const sig = new Uint8Array(mldsa87_1.CryptoBytes);
        (0, mldsa87_1.cryptoSignSignature)(sig, message, secretKey, false, ctx);
        return sig;
    },
    verify(publicKey, message, signature, ctx) {
        return (0, mldsa87_1.cryptoSignVerify)(signature, message, publicKey, ctx);
    },
};
