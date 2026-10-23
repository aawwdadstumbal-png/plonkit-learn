import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCountries, pickRandom } from '../app/js/screens.js';

const INDEX = [
  { slug: 'japan', title: 'Japan', code: 'JP', continent: 'Asia', metaCount: 82, hero: null },
  { slug: 'jordan', title: 'Jordan', code: 'JO', continent: 'Asia', metaCount: 12, hero: null },
  { slug: 'peru', title: 'Peru', code: 'PE', continent: 'South America', metaCount: 20, hero: null },
  { slug: 'france', title: 'France', code: 'FR', continent: 'Europe', metaCount: 92, hero: null },
];

test('matches by title', () => {
  assert.equal(filterCountries(INDEX, 'jap').length, 1);
  assert.equal(filterCountries(INDEX, 'jap')[0].slug, 'japan');
});

test('matches by code', () => {
  assert.equal(filterCountries(INDEX, 'jp').length, 1);
  assert.equal(filterCountries(INDEX, 'jp')[0].slug, 'japan');
});

test('is case insensitive', () => {
  assert.equal(filterCountries(INDEX, 'JAPAN').length, 1);
  assert.equal(filterCountries(INDEX, 'jApAn').length, 1);
});

test('matches a prefix of the title', () => {
  assert.equal(filterCountries(INDEX, 'fran').length, 1);
});

test('matches nothing', () => {
  assert.deepEqual(filterCountries(INDEX, 'zzz'), []);
});

test('an empty query returns everything', () => {
  assert.equal(filterCountries(INDEX, '').length, INDEX.length);
  assert.equal(filterCountries(INDEX, '   ').length, INDEX.length);
});

test('matches on the continent too', () => {
  const found = filterCountries(INDEX, 'south america');
  assert.equal(found.length, 1);
  assert.equal(found[0].slug, 'peru');
});

test('the original index is not mutated', () => {
  const copy = JSON.parse(JSON.stringify(INDEX));
  filterCountries(INDEX, 'jap');
  assert.deepEqual(INDEX, copy);
});

test('pickRandom returns null on an empty list', () => {
  assert.equal(pickRandom([]), null);
  assert.equal(pickRandom(null), null);
});

test('pickRandom returns an element from the list', () => {
  const result = pickRandom(['a', 'b', 'c'], () => 0.5);
  assert.ok(['a', 'b', 'c'].includes(result));
});

test('pickRandom is deterministic with a fixed rng', () => {
  const list = ['x', 'y', 'z'];
  const first = pickRandom(list, () => 0.4);
  const second = pickRandom(list, () => 0.4);
  assert.equal(first, second);
});

test('pickRandom with rng 0 picks the first element', () => {
  assert.equal(pickRandom(['a', 'b', 'c'], () => 0), 'a');
});

test('pickRandom with rng near 1 picks the last element', () => {
  assert.equal(pickRandom(['a', 'b', 'c'], () => 0.999), 'c');
});
