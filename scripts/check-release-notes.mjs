// CI guard for the release-notes rendering gap.
//
// semantic-release only reaches generateNotes when it is actually cutting a
// release, so `semantic-release --dry-run` on a PR proves nothing: on a feature
// branch it stops at "configured to only publish from main", and even pointed at
// the branch it stops at "no relevant changes" whenever the PR carries no
// feat:/fix:/perf: commit. A Dependabot dev-dependency PR is exactly that shape,
// which is how conventional-changelog-conventionalcommits@10.4.0 reached main:
// every gate was green, and the release then died mid-run with
//
//   Missing helper: "conventional-changelog-conventionalcommits requires
//   conventional-changelog-writer@9 or newer ..."
//
// because the preset had outgrown the conventional-changelog-writer that
// semantic-release's own plugins pin. The tag is cut *after* notes render, so
// the failure aborts the release rather than corrupting it — but publishing is
// blocked until someone re-pins by hand.
//
// So render the notes unconditionally instead, through the real plugin and the
// real .releaserc.json config, against synthetic commits covering every release
// type. Any preset/writer incompatibility surfaces here, on the PR that
// introduces it, without a token or a release-shaped branch.
import { readFileSync } from 'node:fs';

const PLUGIN = '@semantic-release/release-notes-generator';

const releaserc = JSON.parse(readFileSync('.releaserc.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// Plugins are listed either bare ("@semantic-release/x") or as [name, config].
const entry = releaserc.plugins.find((p) => (Array.isArray(p) ? p[0] : p) === PLUGIN);
if (!entry) {
  console.error(`::error::${PLUGIN} is not configured in .releaserc.json; this guard is stale.`);
  process.exit(1);
}
const pluginConfig = Array.isArray(entry) ? (entry[1] ?? {}) : {};

// One commit per release type, plus a breaking change and a scope, so every
// section of the preset's template is exercised rather than just the first.
const commits = [
  'feat(mldsa): expose a deterministic signing helper',
  'fix(hash): reject oversized keccak digests',
  'perf(kdf): halve argon2id block copies',
  'feat(aes)!: require a 96-bit nonce\n\nBREAKING CHANGE: aes.encrypt no longer derives the nonce.',
  'chore(deps): bump a dev dependency',
].map((message, i) => ({
  // Hashes must look real: the preset builds commit links from them.
  hash: (i + 1).toString(16).padStart(40, '0'),
  message,
  subject: message.split('\n')[0],
  committerDate: '2026-01-01',
}));

const context = {
  cwd: process.cwd(),
  env: process.env,
  options: { repositoryUrl: pkg.repository.url },
  lastRelease: { version: '0.0.0', gitTag: 'v0.0.0' },
  nextRelease: { version: '0.0.1', gitTag: 'v0.0.1', type: 'patch', channel: null },
  commits,
  logger: { log: () => {}, error: console.error },
};

let notes;
try {
  ({ generateNotes: notes } = await import(PLUGIN));
  notes = await notes(pluginConfig, context);
} catch (error) {
  const preset = pluginConfig.preset ? `conventional-changelog-${pluginConfig.preset}` : 'the configured preset';
  // Read the manifest off disk: the package's "exports" map does not expose
  // package.json, so require()/import of it throws.
  let installed = 'unresolved';
  try {
    installed = JSON.parse(readFileSync('node_modules/conventional-changelog-writer/package.json', 'utf8')).version;
  } catch {
    /* the writer failing to resolve is itself a valid cause; keep the primary error */
  }
  console.error(
    `::error::Release notes failed to render. semantic-release would abort at generateNotes ` +
      `and publish nothing. This usually means ${preset} and conventional-changelog-writer ` +
      `(resolved: ${installed}) have drifted apart — check which writer major semantic-release's ` +
      `plugins pin before bumping the preset.`
  );
  console.error(`\n${error.stack ?? error}`);
  process.exit(1);
}

// A silently empty render would sail past a try/catch and produce an empty
// changelog entry, so assert the commits actually made it into the output.
const missing = ['Features', 'Bug Fixes', 'Performance', 'BREAKING'].filter((s) => !notes.includes(s));
if (missing.length > 0) {
  console.error(
    `::error::Release notes rendered but are missing expected sections: ${missing.join(', ')}. ` +
      `The preset's template or its grouping config has changed shape.`
  );
  console.error(`\n--- rendered notes ---\n${notes}`);
  process.exit(1);
}

console.log('Release notes render correctly through', PLUGIN);
