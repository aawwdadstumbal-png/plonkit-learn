import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataClient } from '../app/js/data.js';
import { summarise, countryProgress } from '../app/js/stats.js';
import { createStore } from '../app/js/store.js';

function memBackend() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

const INDEX = [
  { slug: 'japan', title: 'Japan', code: 'JP', continent: 'Asia', metaCount: 82, hero: null },
  { slug: 'peru', title: 'Peru', code: 'PE', continent: 'South America', metaCount: 20, hero: null },
  { slug: 'france', title: 'France', code: 'FR', continent: 'Europe', metaCount: 92, hero: null },
];

// ------------------------------------------------------------- data client

test('the data client fetches the index once', async () => {
  let calls = 0;
  const client = createDataClient({
    base: '',
    fetchImpl: async (url) => {
      calls++;
      return { ok: true, json: async () => INDEX };
    },
  });
  const first = await client.index();
  const second = await client.index();
  assert.equal(first.length, 3);
  assert.equal(second.length, 3);
  assert.equal(calls, 1);
});

test('the data client caches a guide per slug', async () => {
  const urls = [];
  const client = createDataClient({
    base: '',
    fetchImpl: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => ({ slug: 'japan', title: 'Japan', sections: [] }) };
    },
  });
  await client.guide('japan');
  await client.guide('japan');
  assert.equal(urls.length, 1);
  assert.match(urls[0], /data\/guides\/japan\.json$/);
});

test('the data client builds the guide url from the base', async () => {
  const urls = [];
  const client = createDataClient({
    base: '/plonkit-learn',
    fetchImpl: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => ({}) };
    },
  });
  await client.guide('japan');
  assert.equal(urls[0], '/plonkit-learn/data/guides/japan.json');
});

test('the data client throws on a failed response', async () => {
  const client = createDataClient({
    base: '',
    fetchImpl: async () => ({ ok: false, status: 404, statusText: 'Not Found' }),
  });
  await assert.rejects(() => client.guide('nowhere'), /not found/i);
});

test('clearCache makes the client fetch again', async () => {
  let calls = 0;
  const client = createDataClient({
    base: '',
    fetchImpl: async () => {
      calls++;
      return { ok: true, json: async () => INDEX };
    },
  });
  await client.index();
  client.clearCache();
  await client.index();
  assert.equal(calls, 2);
});

// ------------------------------------------------------------------ stats

test('accuracy is null with no history', () => {
  const store = createStore(memBackend());
  const result = summarise({ history: [], index: INDEX, store });
  assert.equal(result.accuracy, null);
  assert.deepEqual(result.weakest, []);
  assert.equal(result.totalMetas, 194);
  assert.equal(result.totalSeen, 0);
});

test('accuracy counts right and wrong', () => {
  const store = createStore(memBackend());
  const history = [
    { country: 'japan', metaId: 'a', ok: true, at: 1 },
    { country: 'japan', metaId: 'b', ok: true, at: 2 },
    { country: 'japan', metaId: 'c', ok: true, at: 3 },
    { country: 'peru', metaId: 'd', ok: false, at: 4 },
  ];
  const result = summarise({ history, index: INDEX, store });
  assert.equal(result.accuracy, 0.75);
});

test('byCountry counts seen metas', () => {
  const store = createStore(memBackend());
  store.markSeen('japan:a');
  store.markSeen('japan:b');
  const result = summarise({ history: [], index: INDEX, store });
  const japan = result.byCountry.find((c) => c.slug === 'japan');
  assert.equal(japan.seen, 2);
  assert.equal(japan.total, 82);
  assert.equal(japan.title, 'Japan');
});

test('weakest needs five attempts', () => {
  const store = createStore(memBackend());
  const four = Array.from({ length: 4 }, (_, i) => ({ country: 'japan', metaId: 'x' + i, ok: false, at: i }));
  let result = summarise({ history: four, index: INDEX, store });
  assert.equal(result.weakest.length, 0);

  const five = [...four, { country: 'japan', metaId: 'x4', ok: false, at: 5 }];
  result = summarise({ history: five, index: INDEX, store });
  assert.equal(result.weakest.length, 1);
  assert.equal(result.weakest[0].slug, 'japan');
});

test('weakest is sorted by accuracy ascending', () => {
  const store = createStore(memBackend());
  const history = [];
  for (let i = 0; i < 10; i++) {
    history.push({ country: 'japan', metaId: 'j' + i, ok: i < 8, at: i });
    history.push({ country: 'peru', metaId: 'p' + i, ok: i < 2, at: 100 + i });
  }
  const result = summarise({ history, index: INDEX, store });
  assert.equal(result.weakest[0].slug, 'peru');
  assert.ok(result.weakest[0].accuracy < result.weakest[1].accuracy);
});

test('dueCount counts due metas', () => {
  const store = createStore(memBackend());
  store.setSrs('japan:a', { box: 1, due: 1000 });
  store.setSrs('japan:b', { box: 2, due: 99999999999 });
  const result = summarise({ history: [], index: INDEX, store, now: 5000 });
  assert.equal(result.dueCount, 1);
});

test('countryProgress reports the percentage', () => {
  const store = createStore(memBackend());
  store.markSeen('japan:a');
  store.markSeen('japan:b');
  const progress = countryProgress(store, 'japan', 82);
  assert.equal(progress.seen, 2);
  assert.equal(progress.total, 82);
  assert.ok(Math.abs(progress.pct - 2 / 82) < 0.001);
});

test('the streak comes from the store', () => {
  const store = createStore(memBackend());
  store.setStreak({ current: 4, best: 9 });
  const result = summarise({ history: [], index: INDEX, store });
  assert.deepEqual(result.streak, { current: 4, best: 9 });
});
