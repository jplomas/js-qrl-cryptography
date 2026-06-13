#!/usr/bin/env bash
set -euo pipefail

echo "Building tests with TypeScript"
npx tsc --project tsconfig.json

echo "Building tests with Parcel"
npx parcel build --no-cache --no-optimize test-builds/tsc/test/test-vectors/*.js --dist-dir test-builds/parcel --target parcel_tests

echo "Building tests with webpack"
npx webpack --mode development ./test-builds/tsc/test/test-vectors/*.js --output-path ./test-builds

echo "Building tests with Rollup"
npx rollup -c test/rollup.config.mjs
