#!/usr/bin/env node
// Stamps app/sw.js's VERSION with the current commit, so every deploy looks like an
// update to already-installed copies. Run as the last step of the Cloudflare Pages
// build command (after tests), right before Cloudflare uploads app/ as the output dir.
// Usage: node scripts/stamp-sw-version.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'app/sw.js');

// Cloudflare Pages sets CF_PAGES_COMMIT_SHA; GITHUB_SHA covers the GitHub Actions case too.
const sha = (process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 8);
if (!sha) {
  console.log('No commit SHA in the environment; leaving sw.js VERSION as "dev".');
  process.exit(0);
}

const src = fs.readFileSync(file, 'utf8');
const next = src.replace(/const VERSION = '[^']*';/, `const VERSION = '${sha}';`);
if (next === src) throw new Error("Could not find \"const VERSION = '...';\" in app/sw.js");
fs.writeFileSync(file, next);
console.log('Stamped app/sw.js VERSION =', sha);
