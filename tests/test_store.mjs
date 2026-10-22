import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../app/js/store.js';

function memBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}

const KEY = 'plonkit-learn:v1';

test('starts empty', () => {
  const store = createStore(memBackend());
  assert.equal(store.seenCount(), 0);
  assert.deepEqual(store.history(), []);
  assert.deepEqual(store.streak(), { current: 0, best: 0 });
  assert.equal(store.isSeen('japan:0D6J'), false);
  assert.equal(store.note('japan:0D6J'), '');
  assert.deepEqual(store.srs('japan:0D6J'), { box: 0, due: 0 });
});

test('markSeen is idempotent', () => {
  const store = createStore(memBackend());
  store.markSeen('japan:0D6J');
  store.markSeen('japan:0D6J');
  assert.equal(store.seenCount(), 1);
  assert.equal(store.isSeen('japan:0D6J'), true);
});

test('toggleBookmark returns the new state', () => {
  const store = createStore(memBackend());
  assert.equal(store.toggleBookmark('japan:0D6J'), true);
  assert.equal(store.isBookmarked('japan:0D6J'), true);
  assert.equal(store.toggleBookmark('japan:0D6J'), false);
  assert.equal(store.isBookmarked('japan:0D6J'), false);
});

test('setNote with empty string removes the note', () => {
  const store = createStore(memBackend());
  store.setNote('japan:0D6J', 'hello');
  assert.equal(store.note('japan:0D6J'), 'hello');
  store.setNote('japan:0D6J', '');
  assert.equal(store.note('japan:0D6J'), '');
});

test('srs round-trips', () => {
  const store = createStore(memBackend());
  store.setSrs('japan:0D6J', { box: 3, due: 12345 });
  assert.deepEqual(store.srs('japan:0D6J'), { box: 3, due: 12345 });
});

test('history is capped at 2000 and keeps the newest', () => {
  const store = createStore(memBackend());
  for (let i = 0; i < 2100; i++) {
    store.pushHistory({ country: 'japan', metaId: 'm' + i, ok: i % 2 === 0, at: i });
  }
  const history = store.history();
  assert.equal(history.length, 2000);
  assert.equal(history[0].metaId, 'm100');
  assert.equal(history[1999].metaId, 'm2099');
});

test('export and import round-trip', () => {
  const a = createStore(memBackend());
  a.markSeen('japan:0D6J');
  a.markSeen('japan:0D6J2');
  a.toggleBookmark('japan:0D6J');
  a.setNote('japan:0D6J', 'remember the yellow plate');
  a.setSrs('japan:0D6J', { box: 2, due: 999 });
  a.pushHistory({ country: 'japan', metaId: '0D6J', ok: true, at: 5 });
  a.setStreak({ current: 3, best: 7 });

  const b = createStore(memBackend());
  b.import(a.export());

  assert.equal(b.seenCount(), 2);
  assert.equal(b.isSeen('japan:0D6J'), true);
  assert.equal(b.isBookmarked('japan:0D6J'), true);
  assert.equal(b.note('japan:0D6J'), 'remember the yellow plate');
  assert.deepEqual(b.srs('japan:0D6J'), { box: 2, due: 999 });
  assert.deepEqual(b.history(), a.history());
  assert.deepEqual(b.streak(), { current: 3, best: 7 });
});

test('import ignores unknown keys', () => {
  const store = createStore(memBackend());
  store.import({ seen: { 'japan:0D6J': true }, bogus: 1 });
  assert.equal(store.isSeen('japan:0D6J'), true);
  assert.equal(store.export().bogus, undefined);
});

test('a corrupt stored document does not throw', () => {
  const backend = memBackend();
  backend.setItem(KEY, '{not json');
  const store = createStore(backend);
  assert.equal(store.seenCount(), 0);
  store.markSeen('japan:0D6J');
  assert.equal(store.isSeen('japan:0D6J'), true);
});

test('state survives a new store over the same backend', () => {
  const backend = memBackend();
  const a = createStore(backend);
  a.markSeen('japan:0D6J');
  const b = createStore(backend);
  assert.equal(b.isSeen('japan:0D6J'), true);
});

test('reset clears everything', () => {
  const store = createStore(memBackend());
  store.markSeen('japan:0D6J');
  store.toggleBookmark('japan:0D6J');
  store.setNote('japan:0D6J', 'x');
  store.pushHistory({ country: 'japan', metaId: '0D6J', ok: true, at: 1 });
  store.reset();
  assert.equal(store.seenCount(), 0);
  assert.equal(store.isBookmarked('japan:0D6J'), false);
  assert.equal(store.note('japan:0D6J'), '');
  assert.deepEqual(store.history(), []);
});

test('bookmarks and notes are counted', () => {
  const store = createStore(memBackend());
  store.toggleBookmark('a:1');
  store.toggleBookmark('a:2');
  store.setNote('a:3', 'note');
  assert.equal(store.bookmarkCount(), 2);
  assert.equal(store.noteCount(), 1);
});
