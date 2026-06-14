#!/usr/bin/env node
// Packaging smoke test: packs the repo into the tarball npm would publish,
// installs it into a throwaway consumer project, and verifies what we ship
// actually works for every consumer style we claim to support:
//   1. CJS require of every subpath (exercises the vendored-noble dist/cjs)
//   2. ESM import of every subpath
//   3. A strict `--module nodenext` TypeScript consumer compile (.mts + .cts)
//   4. The no-entry-point design: importing the package root must throw
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qrlc-packaging-'));

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    ...opts,
  });
}

const CJS_SMOKE = `
const assert = require("node:assert");
const { keccak256 } = require("@theqrl/qrl-cryptography/keccak");
const { getRandomBytesSync } = require("@theqrl/qrl-cryptography/random");
const { argon2idSync } = require("@theqrl/qrl-cryptography/argon2id");
const { ml_dsa87 } = require("@theqrl/qrl-cryptography/ml_dsa87");
const { encrypt, decrypt } = require("@theqrl/qrl-cryptography/aes");
const {
  utf8ToBytes,
  bytesToUtf8,
  toHex,
} = require("@theqrl/qrl-cryptography/utils");

assert.throws(
  () => require("@theqrl/qrl-cryptography"),
  /no entry-point/,
  "package root must throw by design",
);
assert.strictEqual(
  toHex(keccak256(utf8ToBytes("abc"))),
  "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
);
assert.strictEqual(getRandomBytesSync(70000).length, 70000);
assert.strictEqual(
  argon2idSync(utf8ToBytes("p"), utf8ToBytes("somesalt"), 1, 256, 1, 16)
    .length,
  16,
);
(async () => {
  const key = getRandomBytesSync(32);
  const iv = getRandomBytesSync(12);
  const ct = await encrypt(utf8ToBytes("hello"), key, iv);
  assert.strictEqual(bytesToUtf8(await decrypt(ct, key, iv)), "hello");
  const { publicKey, secretKey } = ml_dsa87.keygen();
  const ctx = utf8ToBytes("ctx");
  const msg = utf8ToBytes("m");
  const sig = ml_dsa87.sign(secretKey, msg, ctx);
  assert.strictEqual(ml_dsa87.verify(publicKey, msg, sig, ctx), true);
  console.log("cjs smoke ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
`;

const ESM_SMOKE = `
import assert from "node:assert";
import { keccak256 } from "@theqrl/qrl-cryptography/keccak";
import { getRandomBytesSync } from "@theqrl/qrl-cryptography/random";
import { argon2idSync } from "@theqrl/qrl-cryptography/argon2id";
import { ml_dsa87 } from "@theqrl/qrl-cryptography/ml_dsa87";
import { encrypt, decrypt } from "@theqrl/qrl-cryptography/aes";
import { utf8ToBytes, bytesToUtf8, toHex } from "@theqrl/qrl-cryptography/utils";

let rootThrew = false;
try {
  await import("@theqrl/qrl-cryptography");
} catch {
  rootThrew = true;
}
assert.ok(rootThrew, "package root must throw by design");
assert.strictEqual(
  toHex(keccak256(utf8ToBytes("abc"))),
  "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
);
assert.strictEqual(getRandomBytesSync(70000).length, 70000);
assert.strictEqual(
  argon2idSync(utf8ToBytes("p"), utf8ToBytes("somesalt"), 1, 256, 1, 16).length,
  16,
);
const key = getRandomBytesSync(32);
const iv = getRandomBytesSync(12);
const ct = await encrypt(utf8ToBytes("hello"), key, iv);
assert.strictEqual(bytesToUtf8(await decrypt(ct, key, iv)), "hello");
const { publicKey, secretKey } = ml_dsa87.keygen();
const ctx = utf8ToBytes("ctx");
const msg = utf8ToBytes("m");
const sig = ml_dsa87.sign(secretKey, msg, ctx);
assert.strictEqual(ml_dsa87.verify(publicKey, msg, sig, ctx), true);
console.log("esm smoke ok");
`;

const TS_CONSUMER = `
import { keccak256, keccak512 } from "@theqrl/qrl-cryptography/keccak";
import { ml_dsa87 } from "@theqrl/qrl-cryptography/ml_dsa87";
import { encrypt, decrypt } from "@theqrl/qrl-cryptography/aes";
import { argon2id, argon2idSync } from "@theqrl/qrl-cryptography/argon2id";
import { getRandomBytesSync } from "@theqrl/qrl-cryptography/random";
import {
  utf8ToBytes,
  bytesToUtf8,
  hexToBytes,
  toHex,
} from "@theqrl/qrl-cryptography/utils";

const h: Uint8Array = keccak256(new Uint8Array([1]));
const kp: { publicKey: Uint8Array; secretKey: Uint8Array } = ml_dsa87.keygen();
const sig: Uint8Array = ml_dsa87.sign(kp.secretKey, h, new Uint8Array(0), false);
const ok: boolean = ml_dsa87.verify(kp.publicKey, h, sig, new Uint8Array(0));
const ct: Promise<Uint8Array> = encrypt(
  h,
  getRandomBytesSync(32),
  getRandomBytesSync(12),
);
const dk: Uint8Array = argon2idSync(
  utf8ToBytes("p"),
  utf8ToBytes("somesalt"),
  1,
  256,
  1,
  32,
);
const dkAsync: Promise<Uint8Array> = argon2id(
  utf8ToBytes("p"),
  utf8ToBytes("somesalt"),
  1,
  256,
  1,
  32,
);
const s: string = bytesToUtf8(utf8ToBytes("x"), { fatal: true });
void [ok, ct, dk, dkAsync, s, decrypt, hexToBytes, toHex, keccak512];
`;

try {
  console.log('packaging smoke: packing tarball');
  const packOut = run('npm', ['pack', '--json', '--pack-destination', tmp], {
    cwd: repoRoot,
  });
  const tarball = path.join(tmp, JSON.parse(packOut)[0].filename);

  const consumer = path.join(tmp, 'consumer');
  fs.mkdirSync(consumer);
  fs.writeFileSync(
    path.join(consumer, 'package.json'),
    JSON.stringify({ name: 'consumer', version: '0.0.0', private: true })
  );

  console.log('packaging smoke: installing tarball into throwaway consumer');
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', tarball], { cwd: consumer });

  console.log('packaging smoke: CJS require');
  fs.writeFileSync(path.join(consumer, 'smoke.cjs'), CJS_SMOKE);
  run('node', ['smoke.cjs'], { cwd: consumer });

  console.log('packaging smoke: ESM import');
  fs.writeFileSync(path.join(consumer, 'smoke.mjs'), ESM_SMOKE);
  run('node', ['smoke.mjs'], { cwd: consumer });

  console.log('packaging smoke: TypeScript nodenext consumer compile');
  fs.writeFileSync(path.join(consumer, 'consumer.mts'), TS_CONSUMER);
  fs.writeFileSync(path.join(consumer, 'consumer.cts'), TS_CONSUMER);
  const tscBin = path.join(repoRoot, 'node_modules', '.bin', 'tsc');
  run(
    tscBin,
    [
      '--noEmit',
      '--strict',
      '--module',
      'nodenext',
      '--moduleResolution',
      'nodenext',
      '--target',
      'es2022',
      'consumer.mts',
      'consumer.cts',
    ],
    { cwd: consumer }
  );

  console.log('packaging smoke: OK');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
