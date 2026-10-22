import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOptions, buildPool, scoreAnswer } from '../app/js/quiz.js';
import { initialState, review, isDue, SRS_INTERVALS } from '../app/js/srs.js';

function countries(spec) {
  // spec: [slug, continent]
  return spec.map(([slug, continent]) => ({ slug, title: slug, continent }));
}

const WORLD = countries([
  ['japan', 'Asia'],
  ['china', 'Asia'],
  ['korea', 'Asia'],
  ['thailand', 'Asia'],
  ['vietnam', 'Asia'],
  ['india', 'Asia'],
  ['france', 'Europe'],
  ['germany', 'Europe'],
  ['spain', 'Europe'],
  ['italy', 'Europe'],
  ['poland', 'Europe'],
  ['norway', 'Europe'],
  ['brazil', 'South America'],
  ['peru', 'South America'],
  ['chile', 'South America'],
]);

// ---------------------------------------------------------------- srs

test('a new meta is box 0 and due now', () => {
  assert.deepEqual(initialState(), { box: 0, due: 0 });
});

test('a correct answer raises the box', () => {
  const result = review({ box: 0, due: 0 }, true, 1000);
  assert.equal(result.box, 1);
  assert.equal(result.due, 1000 + SRS_INTERVALS[1] * 86400000);
});

test('the box caps at 5', () => {
  let state = { box: 0, due: 0 };
  for (let i = 0; i < 9; i++) state = review(state, true, 1000);
  assert.equal(state.box, 5);
});

test('the interval grows with the box', () => {
  const result = review({ box: 4, due: 0 }, true, 1000);
  assert.equal(result.due, 1000 + SRS_INTERVALS[5] * 86400000);
});

test('a wrong answer resets the box and makes it due', () => {
  assert.deepEqual(review({ box: 4, due: 999 }, false, 1000), { box: 0, due: 1000 });
});

test('isDue', () => {
  assert.equal(isDue({ box: 1, due: 1000 }, 999), false);
  assert.equal(isDue({ box: 1, due: 1000 }, 1001), true);
});

// ------------------------------------------------------------- options

test('buildOptions includes the answer exactly once', () => {
  for (let i = 0; i < 20; i++) {
    const opts = buildOptions({ answerSlug: 'japan', countries: WORLD });
    assert.equal(opts.filter((s) => s === 'japan').length, 1);
  }
});

test('buildOptions returns six options', () => {
  assert.equal(buildOptions({ answerSlug: 'japan', countries: WORLD }).length, 6);
});

test('buildOptions has no duplicates', () => {
  const opts = buildOptions({ answerSlug: 'japan', countries: WORLD });
  assert.equal(new Set(opts).size, opts.length);
});

test('buildOptions returns every candidate when there are fewer than six', () => {
  const few = countries([['japan', 'Asia'], ['china', 'Asia'], ['korea', 'Asia'], ['peru', 'South America']]);
  assert.equal(buildOptions({ answerSlug: 'japan', countries: few }).length, 4);
});

test('buildOptions always works with two candidates', () => {
  const two = countries([['japan', 'Asia'], ['china', 'Asia']]);
  const opts = buildOptions({ answerSlug: 'japan', countries: two });
  assert.equal(opts.length, 2);
  assert.equal(opts.filter((s) => s === 'japan').length, 1);
});

test('buildOptions works with only the answer', () => {
  const one = countries([['japan', 'Asia']]);
  assert.deepEqual(buildOptions({ answerSlug: 'japan', countries: one }), ['japan']);
});

test('buildOptions prefers same-continent distractors', () => {
  const opts = buildOptions({ answerSlug: 'japan', countries: WORLD });
  const asia = WORLD.filter((c) => c.continent === 'Asia').map((c) => c.slug);
  const sameContinent = opts.filter((s) => s !== 'japan' && asia.includes(s));
  assert.ok(sameContinent.length >= 1, 'expected at least one same-continent distractor');
});

test('buildOptions never repeats the answer as a distractor', () => {
  const opts = buildOptions({ answerSlug: 'japan', countries: WORLD });
  assert.equal(new Set(opts).size, opts.length);
});

test('buildOptions is deterministic with a fixed rng', () => {
  const a = buildOptions({ answerSlug: 'japan', countries: WORLD, rng: () => 0 });
  const b = buildOptions({ answerSlug: 'japan', countries: WORLD, rng: () => 0 });
  assert.deepEqual(a, b);
});

test('buildOptions uses every candidate when there are exactly six', () => {
  const six = countries([
    ['japan', 'Asia'],
    ['china', 'Asia'],
    ['korea', 'Asia'],
    ['peru', 'South America'],
    ['chile', 'South America'],
    ['france', 'Europe'],
  ]);
  const opts = buildOptions({ answerSlug: 'japan', countries: six });
  assert.equal(opts.length, 6);
  assert.equal(new Set(opts).size, 6);
  for (const slug of six.map((c) => c.slug)) {
    assert.ok(opts.includes(slug), `expected ${slug} in the options`);
  }
});

test('buildOptions never repeats a country across the two pools', () => {
  // Three Asian and two South American countries: the same-continent pool and
  // the rest pool must not hand out the same country twice.
  const mixed = countries([
    ['japan', 'Asia'],
    ['china', 'Asia'],
    ['korea', 'Asia'],
    ['peru', 'South America'],
    ['chile', 'South America'],
  ]);
  for (let i = 0; i < 30; i++) {
    const opts = buildOptions({ answerSlug: 'japan', countries: mixed });
    assert.equal(new Set(opts).size, opts.length);
    assert.equal(opts.length, 5);
  }
});

test('buildOptions works for a country whose continent is alone', () => {
  const sparse = countries([['antarctica', 'Antarctica'], ['japan', 'Asia'], ['china', 'Asia']]);
  const opts = buildOptions({ answerSlug: 'antarctica', countries: sparse });
  assert.equal(opts.filter((s) => s === 'antarctica').length, 1);
  assert.equal(new Set(opts).size, opts.length);
});

// ---------------------------------------------------------------- pool

function guide(slug, title, continent, metaIds) {
  return {
    slug,
    title,
    code: slug.slice(0, 2).toUpperCase(),
    continent,
    hero: null,
    metaCount: metaIds.length,
    sections: [
      {
        id: 's1',
        title: 'Identifying',
        kind: 'tip',
        text: [],
        extras: [],
        metas: metaIds.map((id) => ({
          id,
          image: `img/${slug}/${id}.webp`,
          mapsUrl: null,
          width: 0.5,
          text: [`The clue for ${id} in ${title}.`],
        })),
      },
    ],
  };
}

test('buildPool in country scope returns every meta', () => {
  const g = guide('japan', 'Japan', 'Asia', ['a', 'b', 'c', 'd', 'e']);
  const pool = buildPool({ guides: [g], scope: 'country' });
  assert.equal(pool.length, 5);
  assert.ok(pool.every((entry) => entry.answer === 'japan'));
});

test('buildPool in global scope returns every meta of every guide', () => {
  const a = guide('japan', 'Japan', 'Asia', ['a', 'b', 'c']);
  const b = guide('peru', 'Peru', 'South America', ['d', 'e']);
  assert.equal(buildPool({ guides: [a, b], scope: 'all' }).length, 5);
});

test('buildPool records the country title', () => {
  const g = guide('japan', 'Japan', 'Asia', ['a']);
  assert.equal(buildPool({ guides: [g], scope: 'all' })[0].country, 'Japan');
});

test('buildPool excludes a guide with no metas', () => {
  const a = guide('japan', 'Japan', 'Asia', ['a']);
  const b = guide('empty', 'Empty', 'Europe', []);
  const pool = buildPool({ guides: [a, b], scope: 'all' });
  assert.equal(pool.length, 1);
  assert.equal(pool[0].answer, 'japan');
});

test('buildPool carries the meta text', () => {
  const g = guide('japan', 'Japan', 'Asia', ['a']);
  assert.match(buildPool({ guides: [g], scope: 'all' })[0].text, /The clue for a/);
});

// ------------------------------------------------------------- scoring

test('scoreAnswer', () => {
  const question = { answer: 'japan' };
  assert.deepEqual(scoreAnswer(question, 'japan'), { correct: true, correctSlug: 'japan' });
  assert.deepEqual(scoreAnswer(question, 'peru'), { correct: false, correctSlug: 'japan' });
});
