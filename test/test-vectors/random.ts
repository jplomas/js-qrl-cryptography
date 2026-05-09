import { getRandomBytesSync } from "../../src/random.js";
import { deepStrictEqual } from "./assert.js";

describe("Random number generation", () => {
  it("Returns a Uint8Array of the right size", () => {
    deepStrictEqual(getRandomBytesSync(32) instanceof Uint8Array, true);
    deepStrictEqual(getRandomBytesSync(32).length, 32);
    deepStrictEqual(
      getRandomBytesSync(32).some((b) => b !== 0),
      true,
    );
  });
});
