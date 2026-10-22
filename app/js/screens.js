/**
 * Every screen in the app.
 *
 * A screen is an async function that renders into the shared container. The
 * pure helpers are exported separately so they can be tested without a DOM.
 */

import { el, clear, mount } from './dom.js';
import { countryProgress } from './stats.js';

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

  screens.home = async () => {
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

  screens.country = stub('Country');
  screens.meta = stub('Meta');
  screens.quiz = stub('Quiz');
  screens.stats = stub('Stats');
  screens.review = stub('Review');
  screens.settings = stub('Settings');

  return screens;
}
