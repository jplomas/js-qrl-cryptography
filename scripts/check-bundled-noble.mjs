// CI guard for CIPH-JSQRLC-1. The CommonJS build vendors @noble/hashes, so a
// stale pin ships a frozen copy that consumers' `npm audit` cannot see. Fail
// when the pinned @noble/hashes is behind the latest published release, so a
// vendored-but-stale copy cannot ship silently.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PKG = '@noble/hashes';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const pinned = pkg.dependencies[PKG];
const latest = execFileSync('npm', ['view', PKG, 'version'], { encoding: 'utf8' }).trim();

function core(v) {
  return v.split('-')[0].split('.').map(Number);
}

function isBehind(a, b) {
  const [pa, pb] = [core(a), core(b)];
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0);
  }
  return false;
}

if (isBehind(pinned, latest)) {
  console.error(
    `::error::${PKG} is pinned at ${pinned} but ${latest} is published. The CJS build ` +
      `vendors ${PKG}, so this ships a stale copy invisible to consumer npm audit. Bump the ` +
      `pin, run 'npm run build', and land it as a fix: release.`
  );
  process.exit(1);
}

console.log(`${PKG} pin ${pinned} is current (latest published: ${latest}).`);
