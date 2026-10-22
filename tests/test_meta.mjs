import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenMetas, metaKey } from '../app/js/screens.js';

const GUIDE = {
  slug: 'japan',
  title: 'Japan',
  code: 'JP',
  continent: 'Asia',
  hero: null,
  metaCount: 5,
  sections: [
    {
      id: 's1',
      title: 'Identifying Japan',
      kind: 'tip',
      text: [],
      extras: [],
      metas: [
        { id: 'a', image: 'img/japan/a.webp', mapsUrl: null, width: 0.5, text: ['one'] },
        { id: 'b', image: null, mapsUrl: 'https://maps.example/x', width: null, text: ['two'] },
      ],
    },
    {
      id: 's2',
      title: 'Regional clues',
      kind: 'tip',
      text: [],
      extras: [],
      metas: [
        { id: 'c', image: null, mapsUrl: null, width: null, text: ['three'] },
        { id: 'd', image: null, mapsUrl: null, width: null, text: ['four'] },
        { id: 'e', image: null, mapsUrl: null, width: null, text: ['five'] },
      ],
    },
  ],
};

test('flattenMetas returns every meta in document order', () => {
  const flat = flattenMetas(GUIDE);
  assert.equal(flat.length, 5);
  assert.deepEqual(flat.map((m) => m.id), ['a', 'b', 'c', 'd', 'e']);
});

test('flattenMetas records the section title', () => {
  const flat = flattenMetas(GUIDE);
  assert.equal(flat[0].sectionTitle, 'Identifying Japan');
  assert.equal(flat[2].sectionTitle, 'Regional clues');
});

test('flattenMetas keeps the text and the maps link', () => {
  const flat = flattenMetas(GUIDE);
  assert.deepEqual(flat[0].text, ['one']);
  assert.equal(flat[1].mapsUrl, 'https://maps.example/x');
});

test('flattenMetas on a guide with no metas', () => {
  assert.deepEqual(flattenMetas({ slug: 'x', sections: [] }), []);
  assert.deepEqual(flattenMetas({ slug: 'x', sections: [{ metas: [] }] }), []);
});

test('flattenMetas handles a missing sections key', () => {
  assert.deepEqual(flattenMetas({ slug: 'x' }), []);
});

test('metaKey joins the slug and the meta id', () => {
  assert.equal(metaKey('japan', '0D6J'), 'japan:0D6J');
});

test('metaKey works for a slug with a dash', () => {
  assert.equal(metaKey('south-georgia-sandwich-islands', 'abc'), 'south-georgia-sandwich-islands:abc');
});
