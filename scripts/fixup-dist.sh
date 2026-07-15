#!/usr/bin/env bash
# Drop {"type":"commonjs"} and {"type":"module"} marker files into dist/cjs and
# dist/mjs so Node resolves each subtree with the correct module format.
set -euo pipefail

mkdir -p dist/cjs dist/mjs
echo '{"type": "commonjs"}' > dist/cjs/package.json
echo '{"type": "module"}' > dist/mjs/package.json

# Rollup can preserve trailing whitespace from vendored sources. Normalize it
# so rebuilding dist is deterministic across generated dependency code.
perl -pi -e 's/[ \t]+$//' dist/cjs/*.js dist/mjs/*.js
