import test from 'node:test';
import assert from 'node:assert/strict';
import { collectReviewItems, exportFilename } from '../app/js/screens.js';
import { createStore } from '../app/js/store.js';

function memBackend() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

const INDEX = [
  { slug: 'japan', title: 'Japan', code: 'JP', continent: 'Asia', metaCount: 82, hero: null },
  { slug: 'peru', title: 'Peru', code: 'PE', continent: 'South America', metaCount: 20, hero: null },
];

test('due lists metas whose srs is due', () => {
  const store = createStore(memBackend());
  store.setSrs('japan:a', { box: 1, due: 1000 });
  store.setSrs('japan:b', { box: 2, due: 99999999999 });
  const { due } = collectReviewItems({ index: INDEX, store, now: 5000 });
  assert.equal(due.length, 1);
  assert.equal(due[0].slug, 'japan');
  assert.equal(due[0].metaId, 'a');
  assert.equal(due[0].key, 'japan:a');
  assert.equal(due[0].country, 'Japan');
});

test('starred lists bookmarked metas', () => {
  const store = createStore(memBackend());
  store.toggleBookmark('japan:a');
  store.toggleBookmark('peru:b');
  const { starred } = collectReviewItems({ index: INDEX, store, now: 5000 });
  assert.equal(starred.length, 2);
});

test('an item appears in both lists when it is due and starred', () => {
  const store = createStore(memBackend());
  store.toggleBookmark('japan:a');
  store.setSrs('japan:a', { box: 1, due: 1000 });
  const { due, starred } = collectReviewItems({ index: INDEX, store, now: 5000 });
  assert.equal(due.length, 1);
  assert.equal(starred.length, 1);
});

test('an empty store gives empty lists', () => {
  const store = createStore(memBackend());
  const result = collectReviewItems({ index: INDEX, store, now: 5000 });
  assert.deepEqual(result.due, []);
  assert.deepEqual(result.starred, []);
});

test('a key for an unknown country is left out', () => {
  const store = createStore(memBackend());
  store.toggleBookmark('nowhere:x');
  const { starred } = collectReviewItems({ index: INDEX, store, now: 5000 });
  assert.deepEqual(starred, []);
});

test('the export filename carries the date', () => {
  assert.equal(exportFilename(Date.UTC(2026, 9, 22)), 'plonkit-learn-progress-2026-10-22.json');
});

test('the export filename pads the month and day', () => {
  assert.equal(exportFilename(Date.UTC(2026, 0, 5)), 'plonkit-learn-progress-2026-01-05.json');
});
