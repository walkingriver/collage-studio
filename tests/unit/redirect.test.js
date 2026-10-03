import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../..');

/** Runs the inline <script> of a redirect page against a fake location, returning where it sent the browser. */
function destinationFor(file, pathname, search = '', hash = '') {
  const html = fs.readFileSync(path.join(root, 'redirect', file), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let destination = null;
  const sandbox = { location: { pathname, search, hash, replace: (url) => { destination = url; } } };
  vm.runInNewContext(script, sandbox);
  return destination;
}

test('the homepage redirect sends visitors to the new domain, keeping any query/hash', () => {
  assert.equal(destinationFor('index.html', '/collage-studio/'), 'https://collagestudio.walkingriver.com/');
  assert.equal(destinationFor('index.html', '/collage-studio/', '?v=2', '#top'), 'https://collagestudio.walkingriver.com/?v=2#top');
});

test('the 404 page preserves the path for anything under the old location', () => {
  for (const [from, to] of [
    ['/collage-studio/', 'https://collagestudio.walkingriver.com/'],
    ['/collage-studio', 'https://collagestudio.walkingriver.com/'],
    ['/collage-studio/privacy.html', 'https://collagestudio.walkingriver.com/privacy.html'],
    ['/collage-studio/support.html', 'https://collagestudio.walkingriver.com/support.html'],
  ]) {
    assert.equal(destinationFor('404.html', from), to, `path ${from}`);
  }
});

test('index.html also has a meta refresh, for browsers with JS off but refresh on', () => {
  const html = fs.readFileSync(path.join(root, 'redirect/index.html'), 'utf8');
  assert.match(html, /<meta http-equiv="refresh" content="0; url=https:\/\/collagestudio\.walkingriver\.com\/">/);
});

test('the migrating service worker clears every old cache, sends open tabs onward, and retires', () => {
  const src = fs.readFileSync(path.join(root, 'redirect/sw.js'), 'utf8');
  assert.ok(!src.includes('addAll'), 'must not precache anything of its own');
  assert.match(src, /caches\.delete/);
  assert.match(src, /client\.navigate\(DEST\)/);
  assert.match(src, /self\.registration\.unregister\(\)/);
  assert.ok(!src.includes("addEventListener('fetch'"), 'must never intercept requests');
});

test('stamp-sw-version.mjs updates the VERSION line from a commit SHA, and is idempotent per run', async () => {
  const { execFileSync } = await import('node:child_process');
  const os = await import('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-'));
  fs.mkdirSync(path.join(tmp, 'app'));
  fs.mkdirSync(path.join(tmp, 'scripts'));
  fs.writeFileSync(path.join(tmp, 'app/sw.js'), "const VERSION = 'dev';\nconst CACHE = `x-${VERSION}`;\n");
  fs.copyFileSync(path.join(root, 'scripts/stamp-sw-version.mjs'), path.join(tmp, 'scripts/stamp-sw-version.mjs'));
  execFileSync(process.execPath, ['scripts/stamp-sw-version.mjs'], { cwd: tmp, env: { ...process.env, CF_PAGES_COMMIT_SHA: 'abcdef0123456789' } });
  const stamped = fs.readFileSync(path.join(tmp, 'app/sw.js'), 'utf8');
  assert.match(stamped, /const VERSION = 'abcdef01';/);
  // Without any commit SHA in the environment, it leaves the file alone.
  fs.writeFileSync(path.join(tmp, 'app/sw.js'), "const VERSION = 'dev';\n");
  const { CF_PAGES_COMMIT_SHA, GITHUB_SHA, ...noSha } = process.env;
  execFileSync(process.execPath, ['scripts/stamp-sw-version.mjs'], { cwd: tmp, env: noSha });
  assert.equal(fs.readFileSync(path.join(tmp, 'app/sw.js'), 'utf8'), "const VERSION = 'dev';\n");
  fs.rmSync(tmp, { recursive: true, force: true });
});
