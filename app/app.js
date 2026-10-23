/**
 * The entry point.
 *
 * Wires the store, the data client, the router and the screens together, and
 * registers the service worker when the browser is on a secure origin.
 */

import { createPrefs } from './js/prefs.js';
import { createRouter } from './js/router.js';
import { createScreens } from './js/screens.js';
import { flashcardScreen } from './js/screens/flashcard.js';
import { blindScreen } from './js/screens/blind.js';
import { recommendScreen } from './js/screens/recommend.js';
import { bookmarkScreen } from './js/screens/bookmark.js';
import { setupKeyboardShortcuts } from './js/screens/keyboard.js';

const container = document.getElementById('app');
const prefs = createPrefs();
const { store, data } = prefs;

const screens = createScreens({ store, data, router: null, container });

const router = createRouter({
  routes: {
    '/': () => screens.home(),
    '/country/:slug': ({ slug }) => screens.country({ slug }),
    '/meta/:slug/:metaId': ({ slug, metaId }) => screens.meta({ slug, metaId }),
    '/quiz': () => screens.quiz({}),
    '/quiz/:slug': ({ slug }) => screens.quiz({ slug }),
    '/random': () => screens.random(),
    '/stats': () => screens.stats(),
    '/review': () => screens.review(),
    '/settings': () => screens.settings(),
    '/weakest': () => screens.weakest(),
    '/compare/:slug1/:slug2': ({ slug1, slug2 }) => screens.compare({ slug1, slug2 }),
    '/blind': () => blindScreen({ store, data, router: screens.router, container }),
    '/flashcard/:slug/:metaId': ({ slug, metaId }) => flashcardScreen({ slug, metaId, store, data, router: screens.router, container }),
  },
  onRoute: (pattern, params) => {
    const handler = pattern
      ? {
          '/': screens.home,
          '/country/:slug': screens.country,
          '/meta/:slug/:metaId': screens.meta,
          '/quiz': screens.quiz,
          '/quiz/:slug': screens.quiz,
          '/random': screens.random,
          '/stats': screens.stats,
          '/weakest': screens.weakest,
          '/compare/:slug1/:slug2': screens.compare,
    '/blind': () => blindScreen({ store, data, router: screens.router, container }),
          '/recommend': () => recommendScreen({ store, data, router: screens.router, container }),
          '/bookmark': () => bookmarkScreen({ store, data, router: screens.router, container }),
    '/bookmark': () => bookmarkScreen({ store, data, router: screens.router, container }),
          '/flashcard/:slug/:metaId': (p) => flashcardScreen({ ...p, store, data, router: screens.router, container }),
          '/review': screens.review,
          '/recommend': (p) => recommendScreen({ ...p, store, data, router: screens.router, container }),
          '/settings': screens.settings,
        }[pattern]
      : null;

    if (!handler) {
      // An address that matches nothing must say so, not render a blank page.
      container.textContent = '';
      const box = document.createElement('div');
      box.className = 'card';
      const heading = document.createElement('h2');
      heading.textContent = 'Nothing here';
      const detail = document.createElement('p');
      detail.className = 'muted';
      detail.textContent = 'That address does not match anything in the app.';
      const back = document.createElement('a');
      back.className = 'btn';
      back.href = '#/';
      back.textContent = 'Back to the countries';
      box.append(heading, detail, back);
      container.append(box);
      return;
    }
    Promise.resolve(handler(params)).catch((error) => {
      console.error(error);
      container.textContent = '';
      const box = document.createElement('div');
      box.className = 'card';
      const heading = document.createElement('h2');
      heading.textContent = 'Something went wrong';
      const detail = document.createElement('p');
      detail.className = 'muted';
      detail.textContent = String(error && error.message ? error.message : error);
      box.append(heading, detail);
      container.append(box);
    });
  },
});

// The screens need the router to build links, so hand it over after the
// router exists.
screens.router = router;

router.start();
setupKeyboardShortcuts();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      // A missing service worker only costs offline support.
      console.warn('service worker not registered:', error && error.message);
    });
  });
}
