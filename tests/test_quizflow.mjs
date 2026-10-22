import test from 'node:test';
import assert from 'node:assert/strict';
import { planSession } from '../app/js/screens.js';

const POOL = Array.from({ length: 25 }, (_, i) => ({
  id: 'm' + i,
  country: 'Japan',
  answer: 'japan',
  text: 'clue ' + i,
  section: 'Identifying',
}));

test('planSession takes up to length metas', () => {
  const small = POOL.slice(0, 3);
  assert.equal(planSession(small, 10, () => 0).length, 3);
});

test('planSession caps at length', () => {
  assert.equal(planSession(POOL, 10, () => 0).length, 10);
});

test('planSession never repeats a meta', () => {
  const planned = planSession(POOL, 10, () => 0.5);
  const ids = planned.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('planSession is deterministic with a fixed rng', () => {
  const a = planSession(POOL, 10, () => 0).map((e) => e.id);
  const b = planSession(POOL, 10, () => 0).map((e) => e.id);
  assert.deepEqual(a, b);
});

test('planSession draws from the whole pool', () => {
  const planned = planSession(POOL, 10, () => 0.9);
  assert.equal(new Set(planned.map((e) => e.id)).size, 10);
});

test('planSession on an empty pool', () => {
  assert.deepEqual(planSession([], 10, () => 0), []);
});
