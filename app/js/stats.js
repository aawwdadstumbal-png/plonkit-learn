/**
 * Turning the quiz history into something worth reading.
 *
 * Everything here is derived from the store and the history, so it stays
 * correct however the user moves between the screens.
 */

const WEAKEST_MIN_ATTEMPTS = 5;
const WEAKEST_LIMIT = 10;

function attemptsByCountry(history) {
  const tally = new Map();
  for (const entry of history || []) {
    const slug = entry.country;
    if (!tally.has(slug)) tally.set(slug, { correct: 0, wrong: 0 });
    const bucket = tally.get(slug);
    if (entry.ok) bucket.correct += 1;
    else bucket.wrong += 1;
  }
  return tally;
}

export function countryProgress(store, slug, metaCount) {
  const seen = (store.seenKeys() || []).filter((key) => key.startsWith(`${slug}:`)).length;
  const total = Number(metaCount) || 0;
  return { seen, total, pct: total ? seen / total : 0 };
}

export function summarise({ history = [], index = [], store, now = Date.now() }) {
  const tally = attemptsByCountry(history);

  let correct = 0;
  let wrong = 0;
  for (const bucket of tally.values()) {
    correct += bucket.correct;
    wrong += bucket.wrong;
  }
  const attempts = correct + wrong;

  const byCountry = (index || []).map((entry) => {
    const bucket = tally.get(entry.slug) || { correct: 0, wrong: 0 };
    const total = bucket.correct + bucket.wrong;
    const progress = store ? countryProgress(store, entry.slug, entry.metaCount) : { seen: 0, total: entry.metaCount, pct: 0 };
    return {
      slug: entry.slug,
      title: entry.title,
      code: entry.code,
      continent: entry.continent,
      seen: progress.seen,
      total: entry.metaCount,
      pct: progress.pct,
      correct: bucket.correct,
      wrong: bucket.wrong,
      attempts: total,
      accuracy: total ? bucket.correct / total : null,
    };
  });

  const weakest = byCountry
    .filter((country) => country.attempts >= WEAKEST_MIN_ATTEMPTS)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, WEAKEST_LIMIT);

  const totalMetas = byCountry.reduce((sum, country) => sum + (country.total || 0), 0);
  const totalSeen = byCountry.reduce((sum, country) => sum + (country.seen || 0), 0);

  let dueCount = 0;
  if (store && typeof store.srsEntries === 'function') {
    for (const [, srsState] of store.srsEntries()) {
      const due = Number(srsState && srsState.due) || 0;
      if (due > 0 && due <= now) dueCount += 1;
    }
  }

  return {
    totalMetas,
    totalSeen,
    accuracy: attempts ? correct / attempts : null,
    attempts,
    correct,
    wrong,
    byCountry,
    weakest,
    streak: store ? store.streak() : { current: 0, best: 0 },
    dueCount,
  };
}
