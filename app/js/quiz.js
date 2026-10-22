/**
 * Choosing a country from a meta's image.
 *
 * The answer is always one of the options, the options never repeat a
 * country, and two of the five distractors come from the same continent as
 * the answer whenever the continent has the countries to supply them.
 * Same-continent distractors are the ones that make the quiz teach
 * something: a Swiss road sign and an Austrian one look alike.
 */

/** Pick one element of a list using the injected rng, and remove it. */
function pick(rng, list) {
  if (!list.length) return null;
  const index = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return list.splice(index, 1)[0];
}

function shuffle(rng, list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Build the list of countries to offer for one question.
 *
 * `countries` is an array of { slug, title, continent } and must already
 * exclude guides with no metas. The answer slug is always included exactly
 * once.
 */
export function buildOptions({ answerSlug, countries, count = 6, rng = Math.random }) {
  const answer = countries.find((c) => c.slug === answerSlug) || null;
  const others = countries.filter((c) => c.slug !== answerSlug);

  // The same-continent pool is preferred for the first two distractors.
  // These are separate arrays, so each is drawn from independently, and the
  // used set stops a country being taken twice.
  const sameContinent = answer ? others.filter((c) => c.continent === answer.continent) : [];
  const rest = answer ? others.filter((c) => c.continent !== answer.continent) : [];

  const chosen = [];
  const used = new Set([answerSlug]);

  const take = (pool) => {
    if (!pool.length) return false;
    const candidate = pick(rng, pool);
    if (!candidate || used.has(candidate.slug)) return false;
    used.add(candidate.slug);
    chosen.push(candidate.slug);
    return true;
  };

  for (let i = 0; i < 2 && chosen.length < count - 1; i++) {
    take(sameContinent);
  }
  while (chosen.length < count - 1) {
    if (!take(rest) && !take(sameContinent)) break;
  }

  return shuffle(rng, [answerSlug, ...chosen]);
}

/**
 * Every meta of the selected guides, ready to be sampled.
 *
 * `guides` is an array of guide objects. `scope: 'country'` uses only the
 * first guide; `scope: 'all'` uses every guide.
 */
export function buildPool({ guides, scope = 'all' }) {
  const selected = scope === 'country' ? guides.slice(0, 1) : guides;
  const pool = [];
  for (const guide of selected) {
    for (const section of guide.sections || []) {
      for (const meta of section.metas || []) {
        pool.push({
          id: meta.id,
          country: guide.title,
          answer: guide.slug,
          text: (meta.text || []).join(' '),
          paragraphs: meta.text || [],
          section: section.title,
          image: meta.image,
          mapsUrl: meta.mapsUrl,
        });
      }
    }
  }
  return pool;
}

/** Grade an answer. */
export function scoreAnswer(question, chosenSlug) {
  const correctSlug = question.answer;
  return { correct: chosenSlug === correctSlug, correctSlug };
}
