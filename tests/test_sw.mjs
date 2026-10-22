import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app');

const shellAssets = JSON.parse(readFileSync(join(appDir, 'data', 'shell.json'), 'utf-8'));
const swSource = readFileSync(join(appDir, 'sw.js'), 'utf-8');

test('the shell list includes the entry point', () => {
  for (const path of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest']) {
    assert.ok(shellAssets.includes(path), `expected ${path} in the shell`);
  }
});

test('the shell list includes every js module', () => {
  const modules = [
    'js/data.js',
    'js/store.js',
    'js/md.js',
    'js/quiz.js',
    'js/srs.js',
    'js/stats.js',
    'js/dom.js',
    'js/router.js',
    'js/screens.js',
    'js/prefs.js',
  ];
  for (const path of modules) {
    assert.ok(shellAssets.includes(path), `expected ${path} in the shell`);
  }
});

test('the shell list includes the index data', () => {
  assert.ok(shellAssets.includes('data/index.json'));
});

test('the shell list includes the icons', () => {
  assert.ok(shellAssets.includes('icons/icon-192.png'));
  assert.ok(shellAssets.includes('icons/icon-512.png'));
});

test('the shell list uses relative paths', () => {
  for (const path of shellAssets) {
    assert.ok(!path.startsWith('/'), `${path} must be relative`);
    assert.ok(!path.startsWith('http'), `${path} must be relative`);
  }
});

test('the shell list has no duplicates', () => {
  assert.equal(new Set(shellAssets).size, shellAssets.length);
});

test('the service worker is a classic script, not a module', () => {
  // A classic worker script cannot parse an export statement, so the shell
  // list lives in a JSON file instead. This test keeps it that way.
  assert.doesNotMatch(swSource, /^\s*export\s/m);
  assert.doesNotMatch(swSource, /^\s*import\s/m);
});

test('the service worker resolves its paths against its own directory', () => {
  // The base used to build URLs has to be an absolute URL. A pathname makes
  // every URL built from it throw, which the install handler swallows and
  // the prefetch handler does not. A separate pathname is fine for working
  // out which requests are the app's own data.
  assert.match(swSource, /const BASE = new URL\('\.\/', self\.location\)\.href;/);
  assert.match(swSource, /new URL\(path, BASE\)/);
});
