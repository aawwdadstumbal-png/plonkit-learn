/**
 * A hash router.
 *
 * Routes are matched against the part of the hash after the leading slash,
 * split into segments. A route is written as '/country/:slug'.
 */

function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '').replace(/^\//, '');
  if (!raw) return { path: '/', parts: [] };
  const parts = raw.split('/').filter((part) => part !== '');
  return { path: '/' + parts.join('/'), parts };
}

function match(pattern, parts) {
  const patternParts = pattern.split('/').filter((part) => part !== '');
  if (patternParts.length !== parts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i];
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(parts[i]);
    } else if (expected !== parts[i]) {
      return null;
    }
  }
  return params;
}

export function createRouter({ routes, onRoute }) {
  let current = { path: '/', parts: [] };

  function resolve() {
    const parsed = parseHash(window.location.hash);
    current = parsed;

    for (const [pattern, handler] of Object.entries(routes)) {
      const params = match(pattern, parsed.parts);
      if (params) {
        onRoute(pattern, params, parsed);
        return;
      }
    }
    onRoute(null, {}, parsed);
  }

  return {
    start() {
      window.addEventListener('hashchange', resolve);
      if (!window.location.hash) {
        window.location.hash = '#/';
      }
      resolve();
    },
    navigate(path) {
      const target = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`;
      if (window.location.hash === target) {
        resolve();
      } else {
        window.location.hash = target;
      }
    },
    current() {
      return current;
    },
  };
}
