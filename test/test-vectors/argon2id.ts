import { argon2id as argon2idAsync, argon2idSync } from '../../src/argon2id.js';
import { toHex, utf8ToBytes } from '../../src/utils.js';
import { deepStrictEqual } from './assert.js';

const TEST_VECTORS = [
  // Test vectors taken https://github.com/paulmillr/noble-hashes/blob/main/test/argon2.test.ts
  {
    password: 'password',
    salt: 'somesalt',
    t: 2,
    m: 65536,
    p: 1,
    dkLen: 32,
    derivedKey: '09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7',
  },
  {
    password: 'password',
    salt: 'somesalt',
    t: 2,
    m: 262144,
    p: 1,
    dkLen: 32,
    derivedKey: '78fe1ec91fb3aa5657d72e710854e4c3d9b9198c742f9616c2f085bed95b2e8c',
  },
  {
    password: 'password',
    salt: 'somesalt',
    t: 2,
    m: 256,
    p: 1,
    dkLen: 32,
    derivedKey: '9dfeb910e80bad0311fee20f9c0e2b12c17987b4cac90c2ef54d5b3021c68bfe',
  },
  {
    password: 'password',
    salt: 'somesalt',
    t: 2,
    m: 256,
    p: 2,
    dkLen: 32,
    derivedKey: '6d093c501fd5999645e0ea3bf620d7b8be7fd2db59c20d9fff9539da2bf57037',
  },
  {
    password: 'password',
    salt: 'somesalt',
    t: 1,
    m: 65536,
    p: 1,
    dkLen: 32,
    derivedKey: 'f6a5adc1ba723dddef9b5ac1d464e180fcd9dffc9d1cbf76cca2fed795d9ca98',
  },
  {
    password: 'password',
    salt: 'somesalt',
    t: 4,
    m: 65536,
    p: 1,
    dkLen: 32,
    derivedKey: '9025d48e68ef7395cca9079da4c4ec3affb3c8911fe4f86d1a2520856f63172c',
  },
  {
    password: 'differentpassword',
    salt: 'somesalt',
    t: 2,
    m: 65536,
    p: 1,
    dkLen: 32,
    derivedKey: '0b84d652cf6b0c4beaef0dfe278ba6a80df6696281d7e0d2891b817d8c458fde',
  },
  {
    password: 'password',
    salt: 'diffsalt',
    t: 2,
    m: 65536,
    p: 1,
    dkLen: 32,
    derivedKey: 'bdf32b05ccc42eb15d58fd19b1f856b113da1e9a5874fdcc544308565aa8141c',
  },
];

describe('argon2id', function () {
  describe('argon2id sync', function () {
    for (let i = 0; i < TEST_VECTORS.length; i++) {
      it(`Should process the test ${i} correctly`, function () {
        this.timeout(180000);

        const vector = TEST_VECTORS[i];

        const derived = argon2idSync(
          utf8ToBytes(vector.password),
          utf8ToBytes(vector.salt),
          +vector.t,
          +vector.m,
          +vector.p,
          +vector.dkLen
        );

        deepStrictEqual(toHex(derived), vector.derivedKey);
      });
    }
  });

  describe('argon2id async', function () {
    for (let i = 0; i < TEST_VECTORS.length; i++) {
      it(`Should process the test ${i} correctly`, async function () {
        this.timeout(180000);

        const vector = TEST_VECTORS[i];

        const derived = await argon2idAsync(
          utf8ToBytes(vector.password),
          utf8ToBytes(vector.salt),
          +vector.t,
          +vector.m,
          +vector.p,
          +vector.dkLen
        );

        deepStrictEqual(toHex(derived), vector.derivedKey);
      });
    }
  });
});
