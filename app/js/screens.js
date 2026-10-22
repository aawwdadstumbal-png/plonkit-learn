/**
 * Every screen in the app.
 *
 * A screen is an async function that renders into the shared container. The
 * pure helpers are exported separately so they can be tested without a DOM.
 */

import { el, clear, mount } from './dom.js';
import { countryProgress } from './stats.js';
import { renderMarkdown, splitNoteParagraphs } from './md.js';
import { buildOptions, buildPool, scoreAnswer } from './quiz.js';
import { review as srsReview } from './srs.js';

/** A short message at the bottom of the screen. */
export function showToast(message, ms = 1800) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = el('div', { className: 'toast', text: message, data: { testid: 'toast' } });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), ms);
}

/**
 * Ask the service worker to cache a set of countries for offline use.
 * The callback receives how many files have been saved so far.
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
        entry.code ? el('span', { className: 'badge', text: entry.code }) : null,
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

    const paint = (query) => {
      const visible = filterCountries(index, query);
      clear(grid);
      for (const entry of visible) {
        grid.appendChild(countryCard(entry, store));
      }
      count.textContent = `${visible.length} of ${index.length} countries`;
      if (!visible.length) {
        grid.appendChild(el('p', { className: 'empty', text: 'No country matches that.' }));
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
    if (guide.hero) {
      const img = el('img', { src: guide.hero, alt: '', loading: 'lazy' });
      img.addEventListener('error', () => {
        hero.classList.remove('has-image');
        clear(hero);
        hero.appendChild(
          el('div', { className: 'country-hero-overlay' }, [
            el('h1', { text: guide.title }),
          ]),
        );
      });
      hero.classList.add('has-image');
      hero.appendChild(img);
    } else {
      hero.appendChild(
        el('div', { className: 'country-hero-overlay' }, [el('h1', { text: guide.title })]),
      );
    }

    const sectionList = el('div', { className: 'section-list' });
    for (const section of guide.sections || []) {
      const count = (section.metas || []).length;
      sectionList.appendChild(
        el('a', { className: 'section-link', href: '#/meta/' + slug + '/' + (section.metas[0]?.id || '') }, [
          el('span', { className: 'grow', text: section.title || 'Section' }),
          el('span', {
            className: 'chip',
            text: section.kind === 'map' ? 'maps' : `${count} metas`,
          }),
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
        alt: '',
        loading: 'lazy',
      });
      img.addEventListener('error', () => {
        clear(imageBox);
        imageBox.appendChild(
          el('div', {
            className: 'img-placeholder',
            text: 'No image downloaded for this meta',
            data: { testid: 'meta-image-missing' },
          }),
        );
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
        el('a', { className: 'btn', href: `#/country/${slug}`, text: 'All metas' }),
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
            el('a', { className: 'btn btn-accent', href: slug ? `#/quiz/${slug}` : '#/quiz', text: 'Another session' }),
            el('a', { className: 'btn', href: '#/stats', text: 'See the stats' }),
            el('a', { className: 'btn', href: '#/', text: 'Back to the countries' }),
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

  screens.stats = stub('Stats');
  screens.review = stub('Review');
  screens.settings = stub('Settings');

  return screens;
}
