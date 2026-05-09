// Bundles the ESM build at dist/mjs/*.js into CJS at dist/cjs/*.js,
// inlining @noble/hashes (ESM-only) so CJS consumers can `require()` us.
import resolve from "@rollup/plugin-node-resolve";

const entries = [
  "aes",
  "argon2id",
  "index",
  "keccak",
  "ml_dsa87",
  "random",
  "utils",
];

const externalPackages = ["@theqrl/mldsa87"];
const externalRegex = new RegExp(`^(${externalPackages.join("|")})(/|$)`);

export default entries.map((name) => ({
  input: `dist/mjs/${name}.js`,
  output: {
    file: `dist/cjs/${name}.js`,
    format: "cjs",
    exports: "named",
    sourcemap: false,
  },
  external: (id) => externalRegex.test(id),
  plugins: [resolve({ preferBuiltins: false })],
}));
