// CI guard for the stale-publish gap. semantic-release decides purely from
// commit *messages* — it never inspects the diff — so a rebuilt `dist/` or a
// bumped runtime dependency landed under `chore:`/`ci:` merges to main and
// publishes nothing. npm then keeps serving the previous bundle while main has
// moved on (this is how 0.3.0 came to ship a stale vendored @noble/hashes).
//
// Fail a PR that changes shipped bytes without carrying a releasable commit.
import { execFileSync } from 'node:child_process';

// Types that .releaserc.json's releaseRules map to a version bump.
const RELEASABLE_TYPES = new Set(['feat', 'fix', 'perf']);
// Documented override, e.g. `Skip-Release-Check: reverting unreleased dist churn`.
const OVERRIDE_TRAILER = 'Skip-Release-Check:';

const base = process.env.BASE_SHA || 'origin/main';
const head = process.env.HEAD_SHA || 'HEAD';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

// Three-dot: what this branch changed since it diverged, ignoring main's own
// movement, which is the same set semantic-release will see on merge.
const changed = git('diff', '--name-only', `${base}...${head}`).split('\n').filter(Boolean);

const distTouched = changed.some((f) => f.startsWith('dist/'));

// Externals (see rollup.config.mjs) are not inlined into the CJS bundle, so
// bumping one changes what consumers install without touching dist/ at all.
function runtimeDeps(rev) {
  try {
    return JSON.parse(git('show', `${rev}:package.json`)).dependencies || {};
  } catch {
    return {};
  }
}

const [before, after] = [runtimeDeps(base), runtimeDeps(head)];
const depsChanged = JSON.stringify(before) !== JSON.stringify(after);

if (!distTouched && !depsChanged) {
  console.log('No shipped artifacts changed; release-type check not applicable.');
  process.exit(0);
}

// \x1e (record separator) cannot appear in a commit message, so it is a safe
// delimiter for splitting full message bodies apart.
const commits = git('log', '--format=%x1e%B', `${base}..${head}`)
  .split('\x1e')
  .map((c) => c.trim())
  .filter(Boolean);

function isReleasable(message) {
  const header = message.split('\n')[0];
  const match = /^(\w+)(\([^)]*\))?(!)?:/.exec(header);
  if (!match) return false;
  const [, type, , breaking] = match;
  if (breaking) return true;
  if (/^BREAKING[ -]CHANGE:/m.test(message)) return true;
  return RELEASABLE_TYPES.has(type);
}

const overridden = commits.find((c) => c.includes(OVERRIDE_TRAILER));
if (overridden) {
  const reason = /Skip-Release-Check:(.*)/.exec(overridden)[1].trim();
  console.log(`Release-type check overridden: ${reason || '(no reason given)'}`);
  process.exit(0);
}

if (commits.some(isReleasable)) {
  console.log('Shipped artifacts changed and a releasable commit is present.');
  process.exit(0);
}

const reasons = [distTouched && 'dist/ was rebuilt', depsChanged && 'runtime dependencies changed']
  .filter(Boolean)
  .join(' and ');

console.error(
  `::error::${reasons}, but no commit on this branch triggers a release ` +
    `(need feat:, fix:, perf:, or a breaking change). Merging this would move main ahead of ` +
    `the published package, leaving npm serving the old bundle. Retype the commit — a runtime ` +
    `dependency bump that reaches consumers is a fix:, not a chore:. To override deliberately, ` +
    `add a '${OVERRIDE_TRAILER} <reason>' trailer to a commit.`
);
console.error(`\nCommit subjects inspected:\n${commits.map((c) => `  ${c.split('\n')[0]}`).join('\n')}`);
process.exit(1);
