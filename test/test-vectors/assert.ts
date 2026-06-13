// Minimal assert version to avoid dependencies on node internals.
// Allows us to verify that no browserify version of node internals is
// included in the resulting browser-test builds.
function deepStrictEqual(actual: unknown, expected: unknown, message?: string) {
  const [actualType, expectedType] = [typeof actual, typeof expected];
  const err = new Error(
    `Non-equal values: actual=${actual} (type=${actualType}) expected=${expected} (type=${expectedType})${
      message ? `. Message: ${message}` : ''
    }`
  );
  if (actualType !== expectedType) {
    throw err;
  }
  // Primitive types
  if (['string', 'number', 'bigint', 'undefined', 'boolean'].includes(actualType)) {
    if (actual !== expected) {
      throw err;
    }
    return;
  }
  if (actual instanceof Uint8Array && expected instanceof Uint8Array) {
    if (actual.length !== expected.length) {
      throw err;
    }
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) {
        throw err;
      }
    }
    return;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      throw err;
    }
    for (let i = 0; i < actual.length; i++) {
      deepStrictEqual(actual[i], expected[i], message);
    }
    return;
  }
  if (actual === null && expected === null) {
    return;
  }
  if (actualType === 'object') {
    const [actualKeys, expectedKeys] = [Object.keys(actual as object), Object.keys(expected as object)];
    deepStrictEqual(actualKeys, expectedKeys, message);
    for (const key of actualKeys) {
      deepStrictEqual((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], message);
    }
    return;
  }
  throw err;
}

function throws(cb: () => unknown) {
  try {
    cb();
  } catch {
    return;
  }
  throw new Error('Missing expected exception.');
}

async function rejects(cb: () => Promise<unknown>): Promise<void> {
  try {
    await cb();
  } catch {
    return;
  }
  throw new Error('Missing expected rejection.');
}

export { deepStrictEqual, throws, rejects };
