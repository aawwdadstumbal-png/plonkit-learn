/**
 * Every screen in the app.
 *
 * A screen is an async function that renders into the shared container. The
 * pure helpers are exported separately so they can be tested without a DOM.
 */
import { el, clear, mount } from './dom.js';
import { countryProgress, summarise } from './stats.js';
import { renderMarkdown, splitNoteParagraphs } from './md.js';
import { buildOptions, buildPool, scoreAnswer } from './quiz.js';
import { review as srsReview } from './srs.js';

/** A short message at the bottom of the screen. */
export function showToast(message, ms = 1800, type = 'info', action = null) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = el('div', { 
    className: `toast ${type}`, 
    text: message, 
    'data-testid': 'toast',
    ...(action && { 'data-action': action })
  });
  
  if (action) {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', () => {
      if (typeof action === 'function') {
        action();
      } else {
        window.location.hash = action;
      }
      toast.remove();
    });
  }
  
  document.body.appendChild(toast);
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.remove();
    }
  }, ms);
}

/** Accessibility helper: announce to screen readers */
export function announceToScreenReader(message, priority = 'polite') {
  let liveRegion = document.querySelector('#sr-announcements');
  if (!liveRegion) {
    liveRegion = el('div', {
      id: 'sr-announcements',
      className: 'sr-only',
      'aria-live': priority,
      'aria-atomic': 'true'
    });
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = message;
}

/** Enhanced error handler with toast notification and logging */
export function handleError(error, context = 'application') {
  console.error(`[${context}]`, error);
  
  const message = error.message || 'An error occurred';
  showToast(message, 5000, 'error');
  
  announceToScreenReader(`Error: ${message}`, 'assertive');
  
  return { message, context, error };
}

/**
 * Ask the service worker to cache guides for offline use.
 * `slugs` of null means every country. The callback receives how many files
 * have been saved so far.
 */
export function requestOffline(slugs, onProgress) {
  const worker = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (!worker) {
    showToast('Offline saving needs the app to be served over https');
    if (onProgress) onProgress(0, 0);
    return;
  }
  const channel = new MessageChannel();
  channel.port1.onmessage = (event) => {
    const data = event.data || {};
    if (data.type === 'prefetch-progress' && onProgress) {
      onProgress(data.done || 0, data.total || 0);
    }
  };
  worker.postMessage({ type: 'prefetch', slugs }, [channel.port2]);
}

/**
 * The metas worth revisiting: the ones whose review is due, and the ones the
 * user starred. Both are keyed the way the store keys them.
 */
export function collectReviewItems({ index, store, now = Date.now() }) {
  const titles = new Map((index || []).map((entry) => [entry.slug, entry.title]));
  const due = [];
  const starred = [];

  for (const [key, srsState] of store.srsEntries()) {
    const dueAt = Number(srsState && srsState.due) || 0;
    if (!dueAt || dueAt > now) continue;
    const [slug, metaId] = splitKey(key);
    if (!titles.has(slug)) continue;
    due.push({ key, slug, metaId, country: titles.get(slug) });
  }

  for (const key of store.bookmarkedKeys()) {
    const [slug, metaId] = splitKey(key);
    if (!titles.has(slug)) continue;
    starred.push({ key, slug, metaId, country: titles.get(slug) });
  }

  const byName = (a, b) => a.country.localeCompare(b.country) || a.metaId.localeCompare(b.metaId);
  due.sort(byName);
  starred.sort(byName);
  return { due, starred };
}

function splitKey(key) {
  const at = String(key).indexOf(':');
  if (at < 0) return [String(key), ''];
  return [String(key).slice(0, at), String(key).slice(at + 1)];
}

/** The name the progress export is saved under. */
export function exportFilename(now = Date.now()) {
  const date = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `plonkit-learn-progress-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}.json`;
}

/**
 * Choose the questions of a session.
 *
 * The pool holds every meta of the countries in scope. Distinct metas are
 * sampled at random, without replacement, so one meta is never asked twice
 * before the session ends. A meta answered wrongly is put back on the queue
 * by the quiz screen, not here.
 */
export function planSession(pool, length = 10, rng = Math.random) {
  const remaining = (pool || []).slice();
  const chosen = [];
  const target = Math.min(length, remaining.length);
  while (chosen.length < target && remaining.length) {
    const index = Math.min(remaining.length - 1, Math.floor(rng() * remaining.length));
    chosen.push(remaining.splice(index, 1)[0]);
  }
  return chosen;
}

/**
 * Pick one element from a list using the injected rng.
 * Returns the whole entry, or null when the list is empty.
 */
export function pickRandom(list, rng = Math.random) {
  if (!list || !list.length) return null;
  const index = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return list[index];
}

/** Filter the country list by title, ISO code or continent. */
export function filterCountries(index, query) {
  const list = index || [];
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return list.slice();
  return list.filter((entry) => {
    const title = String(entry.title || '').toLowerCase();
    const code = String(entry.code || '').toLowerCase();
    const continent = String(entry.continent || '').toLowerCase();
    return title.includes(needle) || code.includes(needle) || continent.includes(needle);
  });
}

/** The key a meta is stored under. */
export function metaKey(slug, metaId) {
  return `${slug}:${metaId}`;
}

/** Every meta of a guide, flattened, in document order. */
export function flattenMetas(guide) {
  const flat = [];
  for (const section of (guide && guide.sections) || []) {
    for (const meta of section.metas || []) {
      flat.push({
        id: meta.id,
        section: section.id,
        sectionTitle: section.title,
        image: meta.image || null,
        mapsUrl: meta.mapsUrl || null,
        width: meta.width,
        text: meta.text || [],
      });
    }
  }
  return flat;
}

function countryCard(entry, store) {
  const progress = countryProgress(store, entry.slug, entry.metaCount);
  const percent = Math.round(progress.pct * 100);

  return el(
    'a',
    {
      className: 'card',
      href: `#/country/${entry.slug}`,
      data: { testid: 'country-card', slug: entry.slug },
    },
    [
      el('div', { className: 'card-head' }, [
        entry.code ? el('img', {
          className: 'flag-badge',
          src: `https://flagcdn.com/w40/${entry.code.toLowerCase()}.png`,
          alt: `${entry.title} flag`,
          width: 32,
          height: 24,
          loading: 'lazy',
          'aria-label': `${entry.title} flag`
        }) : null,
        el('span', { className: 'card-title', text: entry.title }),
      ]),
      el('div', {
        className: 'card-meta',
        text: `${entry.continent} · ${entry.metaCount} metas${
          progress.seen ? ` · ${progress.seen} seen` : ''
        }`,
      }),
      el('div', { className: 'progress' }, [
        el('span', { style: { width: `${percent}%` } }),
      ]),
    ],
  );
}

function stub(title) {
  return async () => {
    mount(container, el('div', { className: 'card' }, [el('h2', { text: title })]));
  };
}

export function createScreens({ store, data, router, container }) {
  const screens = {};

  // A screen may register something that has to be undone when the next
  // screen starts, such as a keydown listener.
  let cleanup = null;
  const begin = () => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  };

  screens.home = async () => {
    begin();
    let index = [];
    try {
      index = await data.index();
    } catch (error) {
      mount(
        container,
        el('div', { className: 'card' }, [
          el('h2', { text: 'Could not load the guides' }),
          el('p', { className: 'muted', text: String(error.message || error) }),
        ]),
      );
      return;
    }

    const grid = el('div', { className: 'grid', data: { testid: 'country-grid' } });
    const count = el('span', { className: 'muted small', data: { testid: 'country-count' } });
    
    // Track feature use
    trackFeature('home_screen_loaded');

    const paint = (query) => {
      const visible = filterCountries(index, query);
      clear(grid);
      for (const entry of visible) {
        grid.appendChild(countryCard(entry, store));
      }
      count.textContent = `${visible.length} of ${index.length} countries`;
      if (!visible.length) {
        grid.appendChild(el('p', { className: 'empty', text: getEmptyStateMessage('search', query || '') }));
      }
    };

    const search = el('input', {
      className: 'search',
      type: 'search',
      placeholder: 'Search a country, code or continent...',
      data: { testid: 'country-search' },
      attrs: { 'aria-label': 'Search countries' },
    });
    search.addEventListener('input', () => paint(search.value));
    
    const continents = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania', 'Antarctica'];
    const continentRow = el('div', { className: 'continent-filters', 'aria-label': 'Filter by continent' },
      continents.map(c => el('button', {
        className: 'btn btn-small',
        text: c,
        'aria-label': `Show ${c} countries`,
        onClick: () => { search.value = c; paint(c); }
      }))
    );

    mount(
      container,
      el('div', { className: 'stack' }, [
        el('section', { className: 'hero' }, [
          el('div', { className: 'kicker', text: 'GeoGuessr reference' }),
          el('h1', { text: 'Country guides' }),
          el('p', {
            className: 'muted',
            text: 'Read the clues for a country one at a time, then test yourself.',
          }),
          search,
          el('div', { className: 'row' }, [
            count,
            el('span', { className: 'spacer' }),
            el('a', { className: 'btn btn-accent', href: '#/quiz', text: 'Quiz me' }),
            el('a', { className: 'btn', href: '#/random', text: 'Random meta' }),
          ]),
        ]),
        grid,
      ]),
    );

    paint('');
  };

  screens.country = async ({ slug }) => {
    begin();
    let guide;
    try {
      guide = await data.guide(slug);
    } catch (error) {
      mount(
        container,
        el('div', { className: 'card' }, [
          el('h2', { text: 'Could not load that country' }),
          el('p', { className: 'muted', text: String(error.message || error) }),
          el('a', { className: 'btn', href: '#/', text: 'Back to the countries' }),
        ]),
      );
      return;
    }

    const flat = flattenMetas(guide);
    const progress = countryProgress(store, slug, guide.metaCount);
    const percent = Math.round(progress.pct * 100);

    const hero = el('div', { className: 'country-hero' });
    // The title is always in the overlay, so the country is named whether or
    // not its hero image loads.
    hero.appendChild(
      el('div', { className: 'country-hero-overlay' }, [el('h1', { text: guide.title })]),
    );
    if (guide.hero) {
      const img = el('img', { src: guide.hero, alt: '', loading: 'lazy' });
      img.addEventListener('error', () => {
        img.remove();
        hero.classList.remove('has-image');
      });
      hero.classList.add('has-image');
      hero.appendChild(img);
    }

    const sectionList = el('div', { className: 'section-list' });
    for (const section of guide.sections || []) {
      const metas = section.metas || [];
      const count = metas.length;
      if (!count) {
        // A maps section has no metas, so it is a label rather than a link,
        // and its text is shown underneath.
        sectionList.appendChild(
          el('div', { className: 'card' }, [
            el('div', { className: 'row' }, [
              el('span', { className: 'grow', text: section.title || 'Section' }),
              el('span', { className: 'chip', text: 'maps' }),
            ]),
            el('div', { className: 'meta-text small' }, [
              ...(section.text || []).map((paragraph) => el('p', { html: renderMarkdown(paragraph) })),
            ]),
          ]),
        );
        continue;
      }
      sectionList.appendChild(
        el('a', { className: 'section-link', href: `#/meta/${slug}/${metas[0].id}` }, [
          el('span', { className: 'grow', text: section.title || 'Section' }),
          el('span', { className: 'chip', text: `${count} metas` }),
        ]),
      );
    }

    const firstMeta = flat[0];

    mount(
      container,
      el('div', { className: 'stack' }, [
        hero,
        el('div', { className: 'row' }, [
          guide.code ? el('span', { className: 'badge', text: guide.code }) : null,
          el('span', { className: 'muted small', text: `${guide.continent} · ${guide.metaCount} metas` }),
          el('span', { className: 'spacer' }),
          el('span', {
            className: 'muted small',
            text: `${progress.seen} of ${guide.metaCount} seen`,
            data: { testid: 'country-progress-text' },
          }),
        ]),
        el('div', { className: 'progress' }, [
          el('span', { style: { width: `${percent}%` } }),
        ]),
        el('div', { className: 'btn-row' }, [
          el('a', {
            className: 'btn btn-accent',
            href: firstMeta ? `#/meta/${slug}/${firstMeta.id}` : '#/',
            text: 'Browse the metas',
          }),
          el('a', { className: 'btn', href: `#/quiz/${slug}`, text: 'Quiz this country' }),
          el('a', { className: 'btn btn-info', href: `#/compare/${slug}/france`, text: 'Compare w/ France' }),
          el('button', {
            className: 'btn',
            text: 'Make available offline',
            data: { testid: 'offline-country' },
            onClick: (event) => {
              const button = event.currentTarget;
              button.disabled = true;
              button.textContent = 'Queued...';
              requestOffline([slug], (done, total) => {
                button.textContent = done >= total ? 'Saved offline' : `Saving ${done}/${total}`;
                if (done >= total) button.disabled = false;
              });
            },
          }),
        ]),
        el('h2', { text: 'Sections' }),
        sectionList,
      ]),
    );
  };

  screens.meta = async ({ slug, metaId }) => {
    begin();
    let guide;
    try {
      guide = await data.guide(slug);
    } catch (error) {
      mount(
        container,
        el('div', { className: 'card' }, [
          el('h2', { text: 'Could not load that meta' }),
          el('p', { className: 'muted', text: String(error.message || error) }),
        ]),
      );
      return;
    }

    const flat = flattenMetas(guide);
    const position = flat.findIndex((m) => m.id === metaId);
    if (position < 0) {
      mount(
        container,
        el('div', { className: 'card' }, [
          el('h2', { text: 'That meta does not exist' }),
          el('a', { className: 'btn', href: `#/country/${slug}`, text: 'Back to the country' }),
        ]),
      );
      return;
    }

    const meta = flat[position];
    const key = metaKey(slug, meta.id);
    const { text, notes } = splitNoteParagraphs(meta.text);

    const imageBox = el('div', { data: { testid: 'meta-image' } });
    if (meta.image) {
      const img = el('img', {
        className: 'meta-image',
        src: meta.image,
        alt: meta.text ? meta.text[0] || '' : '',
        loading: 'lazy',
        'data-src': meta.image,
        'aria-label': 'Meta image',
      });
      img.addEventListener('load', () => announceToScreenReader('Image loaded'));
      img.addEventListener('error', () => {
        clear(imageBox);
        imageBox.appendChild(
          el('div', {
            className: 'img-placeholder',
            text: 'No image downloaded for this meta',
            data: { testid: 'meta-image-missing' },
          }),
        );
        announceToScreenReader('Image failed to load', 'assertive');
      });
      imageBox.appendChild(img);
    } else {
      imageBox.appendChild(
        el('div', {
          className: 'img-placeholder',
          text: 'No image for this meta',
          data: { testid: 'meta-image-missing' },
        }),
      );
    }

    const seenToggle = el('button', {
      className: 'btn',
      data: { testid: 'seen-toggle' },
      text: store.isSeen(key) ? 'Seen' : 'Mark as seen',
      onClick: (event) => {
        store.markSeen(key);
        event.currentTarget.textContent = 'Seen';
        event.currentTarget.classList.add('btn-accent');
      },
    });
    if (store.isSeen(key)) seenToggle.classList.add('btn-accent');

    const bookmarkToggle = el('button', {
      className: 'btn',
      data: { testid: 'bookmark-toggle' },
      text: store.isBookmarked(key) ? 'Starred' : 'Star',
      onClick: (event) => {
        const starred = store.toggleBookmark(key);
        event.currentTarget.textContent = starred ? 'Starred' : 'Star';
        event.currentTarget.classList.toggle('btn-accent', starred);
      },
    });
    if (store.isBookmarked(key)) bookmarkToggle.classList.add('btn-accent');

    const noteField = el('textarea', {
      className: 'note-input',
      placeholder: 'Your own note about this meta...',
      data: { testid: 'note-input' },
    });
    noteField.value = store.note(key);
    noteField.addEventListener('change', () => {
      store.setNote(key, noteField.value);
      showToast(noteField.value ? 'Note saved' : 'Note removed');
    });

    const prev = flat[position - 1];
    const next = flat[position + 1];

    const onKey = (event) => {
      if (event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (event.key === 'ArrowLeft' && prev) {
        router.navigate(`/meta/${slug}/${prev.id}`);
      } else if (event.key === 'ArrowRight' && next) {
        router.navigate(`/meta/${slug}/${next.id}`);
      }
    };
    window.addEventListener('keydown', onKey);

    const body = el('div', { className: 'stack' }, [
      el('div', { className: 'row' }, [
        el('a', { className: 'btn', href: '#/', text: 'Menu', 'aria-label': 'Back to main menu', data: { testid: 'meta-back-menu' } }),
        el('a', { className: 'btn', href: `#/country/${slug}`, text: 'All metas', data: { testid: 'meta-back-country' } }),
        el('span', { className: 'spacer' }),
        el('span', {
          className: 'muted small',
          text: `${guide.title} — ${position + 1} of ${flat.length}`,
          data: { testid: 'meta-position' },
        }),
      ]),
      el('div', { className: 'muted small', text: meta.sectionTitle }),
      imageBox,
      el('div', { className: 'meta-text', data: { testid: 'meta-text' } }, [
        ...text.map((paragraph) => el('p', { html: renderMarkdown(paragraph) })),
        ...notes.map((paragraph) => el('div', { className: 'note' }, [
          el('p', { html: renderMarkdown(paragraph) }),
        ])),
      ]),
      meta.mapsUrl
        ? el('a', {
            className: 'maps-link',
            href: meta.mapsUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: 'Open in Google Maps',
            data: { testid: 'meta-maps' },
          })
        : null,
      el('div', { className: 'btn-row' }, [
        seenToggle,
        bookmarkToggle,
        el('span', { className: 'spacer' }),
        el('a', {
          className: 'btn',
          href: prev ? `#/meta/${slug}/${prev.id}` : `#/country/${slug}`,
          text: 'Previous',
          data: { testid: 'prev-meta' },
        }),
        el('a', {
          className: 'btn',
          href: next ? `#/meta/${slug}/${next.id}` : `#/country/${slug}`,
          text: 'Next',
          data: { testid: 'next-meta' },
        }),
      ]),
      el('h3', { text: 'Your note' }),
      noteField,
    ]);

    mount(container, el('div', { className: 'stack', data: { metaKey: key } }, [body]));

    // The keydown handler belongs to this screen, so it is removed when the
    // next screen starts.
    cleanup = () => window.removeEventListener('keydown', onKey);
  };

  screens.quiz = async ({ slug }) => {
    begin();

    let index = [];
    let guides = [];
    let pool = [];
    let scopeLabel = 'any country';

    try {
      index = await data.index();
      if (slug) {
        guides = [await data.guide(slug)];
        scopeLabel = guides[0].title;
      } else {
        guides = await data.allGuides();
        scopeLabel = 'any country';
      }
      pool = buildPool({ guides, scope: slug ? 'country' : 'all' });
    } catch (error) {
      mount(
        container,
        el('div', { className: 'card' }, [
          el('h2', { text: 'Could not build the quiz' }),
          el('p', { className: 'muted', text: String(error.message || error) }),
        ]),
      );
      return;
    }

    if (!pool.length) {
      mount(
        container,
        el('div', { className: 'card' }, [
          el('h2', { text: 'Nothing to quiz' }),
          el('p', { className: 'muted', text: 'This country has no metas yet.' }),
        ]),
      );
      return;
    }

    const countries = index.map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      continent: entry.continent,
    }));

    const queue = planSession(pool, 10);
    const asked = new Set();
    let current = null;
    let answered = false;
    let correctCount = 0;
    let wrongCount = 0;
    const missed = [];

    const prompt = el('p', { className: 'quiz-prompt', text: `Which country is this from?` });
    const imageBox = el('div', { data: { testid: 'quiz-image' } });
    const optionsBox = el('div', { className: 'quiz-options', data: { testid: 'quiz-options' } });
    const revealBox = el('div', { className: 'quiz-reveal', data: { testid: 'quiz-reveal' } });
    const nextButton = el('button', {
      className: 'btn btn-accent',
      text: 'Next question',
      data: { testid: 'quiz-next' },
      onClick: () => next(),
    });
    const summaryBox = el('div', { className: 'stack', data: { testid: 'quiz-summary' } });
    const skipButton = el('button', {
      className: 'btn',
      text: 'End the session',
      data: { testid: 'quiz-skip' },
      onClick: () => showSummary(),
    });

    const questionArea = el('div', { className: 'stack' }, [
      prompt,
      imageBox,
      optionsBox,
      revealBox,
      el('div', { className: 'btn-row' }, [nextButton, skipButton]),
    ]);

    const counter = el('span', { className: 'muted small', data: { testid: 'quiz-counter' } });

    mount(
      container,
      el('div', { className: 'stack' }, [
        el('div', { className: 'row' }, [
          el('h1', { text: 'Quiz' }),
          el('span', { className: 'spacer' }),
          counter,
        ]),
        el('p', { className: 'muted small', text: `Metas from ${scopeLabel}.` }),
        questionArea,
        summaryBox,
      ]),
    );

    function drawQuestion() {
      answered = false;
      clear(revealBox);
      revealBox.setAttribute('hidden', '');
      nextButton.setAttribute('hidden', '');
      skipButton.setAttribute('hidden', '');

      if (!queue.length) {
        showSummary();
        return;
      }

      current = queue.shift();
      asked.add(`${current.answer}:${current.id}`);
      counter.textContent = `Question ${correctCount + wrongCount + 1} of 10`;

      clear(imageBox);
      if (current.image) {
        const img = el('img', {
          className: 'meta-image',
          src: current.image,
          alt: '',
          data: { testid: 'quiz-image-img' },
        });
        img.addEventListener('error', () => {
          clear(imageBox);
          imageBox.appendChild(
            el('div', {
              className: 'img-placeholder',
              text: 'No image downloaded for this meta',
              data: { testid: 'quiz-image-missing' },
            }),
          );
        });
        imageBox.appendChild(img);
      } else {
        imageBox.appendChild(
          el('div', {
            className: 'img-placeholder',
            text: 'No image downloaded for this meta',
            data: { testid: 'quiz-image-missing' },
          }),
        );
      }

      const options = buildOptions({
        answerSlug: current.answer,
        countries,
        count: 6,
      });

      clear(optionsBox);
      for (const optionSlug of options) {
        const entry = countries.find((c) => c.slug === optionSlug);
        const button = el('button', {
          className: 'quiz-option',
          text: entry ? entry.title : optionSlug,
          data: { testid: 'quiz-option', slug: optionSlug },
          onClick: (event) => choose(event.currentTarget, optionSlug),
        });
        optionsBox.appendChild(button);
      }

      skipButton.removeAttribute('hidden');
    }

    function choose(button, chosenSlug) {
      if (answered) return;
      answered = true;

      const { correct } = scoreAnswer(current, chosenSlug);
      const key = metaKey(current.answer, current.id);

      for (const option of optionsBox.querySelectorAll('.quiz-option')) {
        option.disabled = true;
        if (option.dataset.slug === current.answer) option.classList.add('correct');
        else if (option === button) option.classList.add('wrong');
      }

      store.markSeen(key);
      store.setSrs(key, srsReview(store.srs(key), correct));

      const streak = store.streak();
      store.setStreak(
        correct
          ? { current: streak.current + 1, best: streak.best }
          : { current: 0, best: streak.best },
      );

      store.pushHistory({
        country: current.answer,
        metaId: current.id,
        ok: correct,
        at: Date.now(),
      });

      if (correct) {
        correctCount += 1;
      } else {
        wrongCount += 1;
        missed.push(current);
        // A wrong answer comes back later in the same session.
        queue.push(current);
      }

      clear(revealBox);
      revealBox.removeAttribute('hidden');
      revealBox.appendChild(
        el('div', {
          className: `quiz-verdict ${correct ? 'right' : 'wrong'}`,
          text: correct ? 'Correct' : `Not quite - it is ${countryTitle(current.answer)}`,
        }),
      );
      const { text, notes } = splitNoteParagraphs(current.paragraphs || []);
      for (const paragraph of text) {
        revealBox.appendChild(el('p', { html: renderMarkdown(paragraph) }));
      }
      for (const paragraph of notes) {
        revealBox.appendChild(el('div', { className: 'note' }, [el('p', { html: renderMarkdown(paragraph) })]));
      }
      if (current.mapsUrl) {
        revealBox.appendChild(
          el('a', {
            className: 'maps-link',
            href: current.mapsUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: 'Open in Google Maps',
            data: { testid: 'quiz-maps' },
          }),
        );
      }

      nextButton.removeAttribute('hidden');
      counter.textContent = `${correctCount} right, ${wrongCount} wrong`;
    }

    function countryTitle(slug) {
      const entry = countries.find((c) => c.slug === slug);
      return entry ? entry.title : slug;
    }

    function next() {
      drawQuestion();
    }

    function showSummary() {
      clear(questionArea);
      questionArea.setAttribute('hidden', '');
      clear(summaryBox);
      summaryBox.removeAttribute('hidden');

      const total = correctCount + wrongCount;
      summaryBox.appendChild(
        el('div', { className: 'card' }, [
          el('div', { className: 'quiz-score', text: `${correctCount} / ${total}` }),
          el('p', { className: 'muted', text: 'right answers' }),
        el('div', { className: 'btn-row' }, [
          el('a', { className: 'btn btn-accent', href: '#/stats', text: 'Back to stats' }),
          el('a', { className: 'btn btn-accent', href: '#/quiz', text: 'Another session' }),
        ]),
        ]),
      );

      if (missed.length) {
        summaryBox.appendChild(el('h2', { text: 'You missed' }));
        const list = el('div', { className: 'list' });
        for (const entry of missed) {
          list.appendChild(
            el('div', { className: 'list-row' }, [
              el('span', { className: 'chip', text: countryTitle(entry.answer) }),
              el('span', { className: 'grow', text: (entry.paragraphs || []).join(' ').slice(0, 140) }),
              el('a', { className: 'btn', href: `#/meta/${entry.answer}/${entry.id}`, text: 'Open' }),
            ]),
          );
        }
        summaryBox.appendChild(list);
      }
    }

    drawQuestion();
  };

  screens.weakest = async () => {
    begin();
    const index = await data.index();
    const summary = summarise({ history: store.history(), index, store });
    const weakest = summary.weakest || [];
    if (!weakest.length) {
      mount(container, el('div', { className: 'card' }, [
        el('h2', { text: 'Nothing to drill' }),
        el('p', { className: 'muted', text: 'Answer more questions to build weakest-country stats.' }),
        el('a', { className: 'btn', href: '#/', text: 'Back to countries' }),
      ]));
      return;
    }
    const target = weakest[Math.floor(Math.random() * weakest.length)];
    router.navigate(`/quiz/${target.slug}`);
  };

  screens.compare = async ({ slug1, slug2 }) => {
    begin();
    try {
      const [g1, g2] = await Promise.all([data.guide(slug1), data.guide(slug2)]);
      mount(container, el('div', { className: 'stack', 'data-testid': 'compare-view' }, [
        el('h1', { text: `${g1.title} vs ${g2.title}` }),
        el('div', { className: 'compare-grid' }, [
          el('div', { className: 'compare-panel' }, [
            el('h2', { text: g1.title }),
            el('p', { className: 'muted', text: `${g1.metaCount} metas · ${g1.continent}` }),
            el('a', { className: 'btn', href: `#/country/${slug1}`, text: 'Open' }),
          ]),
          el('div', { className: 'compare-panel' }, [
            el('h2', { text: g2.title }),
            el('p', { className: 'muted', text: `${g2.metaCount} metas · ${g2.continent}` }),
            el('a', { className: 'btn', href: `#/country/${slug2}`, text: 'Open' }),
          ]),
        ]),
      ]));
    } catch (e) {
      mount(container, el('div', { className: 'card' }, [
        el('h2', { text: 'Could not compare' }),
        el('p', { className: 'muted', text: String(e.message || e) }),
      ]));
    }
  };

  screens.stats = async () => {
    begin();
    const index = await data.index();
    const summary = summarise({ history: store.history(), index, store });
    
    // Track stats view
    trackFeature('stats_viewed', { accuracy: summary.accuracy, weakestCount: summary.weakest.length });

    const accuracy = summary.accuracy === null ? 'no answers yet' : `${Math.round(summary.accuracy * 100)}%`;

    const weakest = summary.weakest || [];
    const statRow = el('div', { className: 'stat-row' }, [
      el('div', { className: 'stat' }, [
        el('div', { className: 'value', text: String(summary.totalSeen), data: { testid: 'stats-total' } }),
        el('div', { className: 'label', text: `metas seen of ${summary.totalMetas}` }),
      ]),
      el('div', { className: 'stat' }, [
        el('div', { className: 'value', text: accuracy, data: { testid: 'stats-accuracy' } }),
        el('div', { className: 'label', text: 'accuracy' }),
      ]),
      el('div', { className: 'stat' }, [
        el('div', { className: 'value', text: String(summary.streak.current) }),
        el('div', { className: 'label', text: `streak, best ${summary.streak.best}` }),
      ]),
      el('div', { className: 'stat' }, [
        el('div', { className: 'value', text: String(summary.dueCount) }),
        el('div', { className: 'label', text: 'reviews due' }),
      ]),
    ]);

    const weakest = el('div', { className: 'list', data: { testid: 'stats-weakest' } });
    if (summary.weakest.length) {
      for (const country of summary.weakest) {
        weakest.appendChild(
          el('div', { className: 'list-row' }, [
            el('a', { className: 'grow', href: `#/country/${country.slug}`, text: country.title }),
            el('span', {
              className: `chip ${country.accuracy >= 0.5 ? 'good' : 'bad'}`,
              text: `${Math.round(country.accuracy * 100)}% of ${country.attempts}`,
            }),
          ]),
        );
      }
    } else {
      weakest.appendChild(
        el('p', {
          className: 'empty',
          text: 'Answer at least five questions in a country to see it listed here.',
        }),
      );
    }

    const table = el('table', { className: 'table' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Country' }),
          el('th', { className: 'num', text: 'Seen' }),
          el('th', { className: 'num', text: 'Metas' }),
          el('th', { className: 'num', text: 'Right' }),
          el('th', { className: 'num', text: 'Wrong' }),
        ]),
      ]),
      el(
        'tbody',
        {},
        summary.byCountry.map((country) =>
          el('tr', {}, [
            el('td', {}, [el('a', { href: `#/country/${country.slug}`, text: country.title })]),
            el('td', { className: 'num', text: String(country.seen) }),
            el('td', { className: 'num', text: String(country.total) }),
            el('td', { className: 'num', text: String(country.correct) }),
            el('td', { className: 'num', text: String(country.wrong) }),
          ]),
        ),
      ),
    ]);

    mount(
      container,
      el('div', { className: 'stack' }, [
        el('h1', { text: 'Stats' }),
        statRow,
        el('div', { className: 'btn-row', style: { marginTop: '8px' } }, [
          el('a', { className: 'btn btn-accent', href: '#/weakest', text: 'Drill weakest', 'aria-label': 'Quiz weakest countries' }),
        ]),
        el('h2', { text: 'Weakest countries' }),
        weakest,
        el('h2', { text: 'Every country' }),
        el('div', { className: 'card', style: { overflowX: 'auto' } }, [table]),
      ]),
    );

  };

  screens.random = async () => {
    begin();
    let guides = [];
    try {
      guides = await data.allGuides();
    } catch (error) {
      mount(
        container,
        el('div', { className: 'card' }, [
          el('h2', { text: 'Could not build the random picker' }),
          el('p', { className: 'muted', text: String(error.message || error) }),
        ]),
      );
      return;
    }

    const pool = buildPool({ guides, scope: 'all' });
    const entry = pickRandom(pool);
    if (!entry) {
      mount(
        container,
        el('div', { className: 'card' }, [
          el('h2', { text: 'Nothing to pick' }),
          el('p', { className: 'muted', text: 'There are no metas to browse yet.' }),
          el('a', { className: 'btn', href: '#/', text: 'Back to the countries' }),
        ]),
      );
      return;
    }
    window.history.replaceState(null, '', `#/meta/${entry.answer}/${entry.id}`);
    window.location.hash = `#/meta/${entry.answer}/${entry.id}`;
  };

  screens.review = async () => {
    begin();
    const index = await data.index();
    const { due, starred } = collectReviewItems({ index, store });

    const dueList = el('div', { className: 'list', data: { testid: 'review-due' } });
    if (due.length) {
      for (const item of due) {
        dueList.appendChild(
          el('div', { className: 'list-row' }, [
            el('span', { className: 'chip', text: item.country }),
            el('a', { className: 'grow', href: `#/meta/${item.slug}/${item.metaId}`, text: `Meta ${item.metaId}` }),
            el('a', { className: 'btn', href: `#/quiz/${item.slug}`, text: 'Quiz' }),
          ]),
        );
      }
    } else {
      dueList.appendChild(el('p', { className: 'empty', text: 'Nothing is due for review right now.' }));
    }

    const starredList = el('div', { className: 'list', data: { testid: 'review-bookmarked' } });
    if (starred.length) {
      for (const item of starred) {
        starredList.appendChild(
          el('div', { className: 'list-row' }, [
            el('span', { className: 'chip', text: item.country }),
            el('a', { className: 'grow', href: `#/meta/${item.slug}/${item.metaId}`, text: `Meta ${item.metaId}` }),
            el('a', { className: 'btn', href: `#/quiz/${item.slug}`, text: 'Quiz' }),
          ]),
        );
      }
    } else {
      starredList.appendChild(el('p', { className: 'empty', text: 'You have not starred any metas yet.' }));
    }

    mount(
      container,
      el('div', { className: 'stack' }, [
        el('h1', { text: 'Review' }),
        el('h2', { text: `Due (${due.length})` }),
        dueList,
        el('h2', { text: `Starred (${starred.length})` }),
        starredList,
      ]),
    );
  };

  screens.settings = async () => {
    begin();

    const importInput = el('input', {
      type: 'file',
      accept: 'application/json,.json',
      data: { testid: 'settings-import-input' },
      style: { display: 'none' },
    });
    importInput.addEventListener('change', async () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        store.import(parsed);
        showToast('Progress imported');
        router.navigate('/stats');
      } catch (error) {
        showToast(`That file could not be read: ${error.message || error}`);
      }
      importInput.value = '';
    });

    const exportButton = el('button', {
      className: 'btn',
      text: 'Export progress',
      data: { testid: 'settings-export' },
      onClick: () => {
        const blob = new Blob([JSON.stringify(store.export(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = el('a', { href: url, download: exportFilename() });
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Progress exported');
      },
    });

    const downloadAll = el('button', {
      className: 'btn',
      text: 'Make everything available offline',
      data: { testid: 'settings-download-all' },
      onClick: (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = 'Saving...';
        requestOffline(null, (done, total) => {
          button.textContent = total ? `Saving ${done}/${total}` : 'Saved offline';
          if (total && done >= total) {
            button.disabled = false;
            button.textContent = 'Make everything available offline';
          }
        });
      },
    });

    const resetButton = el('button', {
      className: 'btn btn-danger',
      text: 'Reset all progress',
      data: { testid: 'settings-reset' },
      onClick: () => {
        if (!window.confirm('This clears everything: seen metas, stars, notes and the review schedule. It cannot be undone.')) {
          return;
        }
        store.reset();
        showToast('Progress cleared');
        router.navigate('/');
      },
    });

    mount(
      container,
      el('div', { className: 'stack' }, [
        el('h1', { text: 'Settings' }),
        el('div', { className: 'card' }, [
          el('h2', { text: 'Your progress' }),
          el('p', {
            className: 'muted',
            text: 'Everything is kept in this browser only. Nothing is uploaded anywhere. Export it before you change the address the app is served from, because the browser ties stored progress to the address.',
          }),
          el('div', { className: 'btn-row' }, [
            exportButton,
            el('button', {
              className: 'btn',
              text: 'Import progress',
              data: { testid: 'settings-import' },
              onClick: () => importInput.click(),
            }),
            importInput,
          ]),
        ]),
        el('div', { className: 'card' }, [
          el('h2', { text: 'Offline' }),
          el('p', {
            className: 'muted',
            text: 'Caching the guides and their images lets the app work with no connection at all.',
          }),
          el('div', { className: 'btn-row' }, [downloadAll]),
        ]),
        el('div', { className: 'card' }, [
          el('h2', { text: 'Start again' }),
          el('p', { className: 'muted', text: 'Clears every trace of your progress on this device.' }),
          el('div', { className: 'btn-row' }, [resetButton]),
        ]),
      ]),
    );
  };

  return screens;
}

// Phase 3: Performance, empty states, analytics, animations
export function getEmptyStateMessage(context = "search", query = "") {
  switch (context) {
    case "search": return query ? `No country matches "${query}".` : "No countries found.";
    case "quiz": return "No metas available for this quiz.";
    case "meta": return "No metas in this section.";
    default: return "Nothing to show.";
  }
}

export function trackFeature(featureName, extra = {}) {
  try {
    const log = JSON.parse(localStorage.getItem("plonkit-analytics") || "[]");
    log.push({ feature: featureName, time: Date.now(), ...extra });
    localStorage.setItem("plonkit-analytics", JSON.stringify(log.slice(-100)));
    console.log("[Analytics]", featureName, extra);
  } catch (e) { /* analytics non-blocking */ }
}

export function trackPerformance(opName, durMs) {
  try {
    const log = JSON.parse(localStorage.getItem("plonkit-perf") || "[]");
    log.push({ op: opName, durMs, time: new Date().toISOString() });
    localStorage.setItem("plonkit-perf", JSON.stringify(log.slice(-50)));
    if (durMs > 2000) console.warn(`[Slow] ${opName}: ${durMs}ms`);
  } catch (e) {}
}

export function animateTransition(el, fromC, toC) {
  el.classList.remove(fromC || "");
  el.classList.add("animating");
  el.offsetHeight;
  if (toC) el.classList.add(toC);
  setTimeout(() => { el.classList.remove("animating"); if (fromC) el.classList.add(fromC); }, 300);
}
