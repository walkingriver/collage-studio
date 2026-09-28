import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '../../app');

function precacheList() {
  const src = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const sandbox = { self: { addEventListener() {} }, location: {}, caches: {}, fetch() {} };
  vm.runInNewContext(`${src}\n;globalThis.__files = FILES;`, sandbox);
  return sandbox.__files;
}

function walk(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

test('service worker precaches every app file, and only files that exist', () => {
  const files = precacheList();
  for (const f of files) if (f !== './') assert.ok(fs.existsSync(path.join(root, f)), `missing on disk: ${f}`);
  const needed = [
    ...walk('js'), ...walk('css'), ...walk('vendor').filter((f) => f.endsWith('.js')),
    ...walk('fonts').filter((f) => f.endsWith('.woff2')),
    'index.html', 'manifest.webmanifest',
  ];
  for (const f of needed) assert.ok(files.includes(f), `not precached: ${f}`);
});
