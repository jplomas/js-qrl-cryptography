import { deepStrictEqual } from './assert.js';

// The no-entry-point behavior is a package-resolution property (consumers
// importing the bare package get a clear error). It is verified for real
// against the published tarball by scripts/packaging-smoke.mjs (CJS + ESM).
// Here we only re-check it under node; browser bundlers handle a dynamic
// import of an intentionally-throwing module inconsistently (e.g. Parcel
// rewraps the rejection), which would test the bundler, not our code.
const isNode =
  typeof process === 'object' &&
  process !== null &&
  typeof process.versions === 'object' &&
  process.versions !== null &&
  typeof process.versions.node === 'string';
const itIfNode = isNode ? it : it.skip;

describe('package entry point', () => {
  itIfNode('has no entry point by design: importing the root module throws', async () => {
    let message = '';
    try {
      await import('../../src/index.js');
    } catch (e) {
      message = (e as Error).message;
    }
    deepStrictEqual(message.includes('no entry-point'), true);
  });
});
