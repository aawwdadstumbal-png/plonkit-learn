import test from 'node:test';
import assert from 'node:assert/strict';
import { shellAssets } from '../app/sw.js';

test('shellAssets includes the entry point', () => {
  const assets = shellAssets();
  for (const path of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest']) {
    assert.ok(assets.includes(path), `expected ${path} in the shell`);
  }
});

test('shellAssets includes every js module', () => {
  const assets = shellAssets();
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
    assert.ok(assets.includes(path), `expected ${path} in the shell`);
  }
});

test('shellAssets includes the index data', () => {
  assert.ok(shellAssets().includes('data/index.json'));
});

test('shellAssets includes the icons', () => {
  const assets = shellAssets();
  assert.ok(assets.includes('icons/icon-192.png'));
  assert.ok(assets.includes('icons/icon-512.png'));
});

test('shellAssets uses relative paths', () => {
  for (const path of shellAssets()) {
    assert.ok(!path.startsWith('/'), `${path} must be relative`);
    assert.ok(!path.startsWith('http'), `${path} must be relative`);
  }
});

test('shellAssets has no duplicates', () => {
  const assets = shellAssets();
  assert.equal(new Set(assets).size, assets.length);
});
