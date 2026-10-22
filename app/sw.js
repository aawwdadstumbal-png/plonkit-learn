/**
 * The service worker.
 *
 * It caches the app shell so the app opens with no connection, and it can be
 * asked to cache the guide data and images so a country works offline.
 *
 * This is a plain classic script, not a module, so it runs in every browser.
 * The list of shell files lives in data/shell.json rather than in this file,
 * because a classic script cannot export anything and the same list is
 * checked by the tests.
 *
 * Every path is relative to the directory the app is served from, because the
 * app lives in a subdirectory on GitHub Pages.
 */

const CACHE_NAME = 'plonkit-learn-v1';
const DATA_PREFIX = 'data/';

const isServiceWorker =
  typeof self !== 'undefined' && typeof caches !== 'undefined' && typeof self.skipWaiting === 'function';

if (isServiceWorker) {
  // The base has to be an absolute URL, not a pathname, or every URL built
  // from it throws. It carries the subdirectory the app is served from.
  const BASE = new URL('./', self.location).href;
  // The path prefix the app lives under, used to recognise its own data.
  const BASE_PATH = new URL('./', self.location).pathname;

  const resolve = (path) => new URL(path, BASE).toString();

  self.addEventListener('install', (event) => {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        let assets = [];
        try {
          const response = await fetch(resolve('data/shell.json'), { cache: 'reload' });
          if (response.ok) assets = await response.json();
        } catch {
          // Without the list the shell is simply not precached.
        }
        await Promise.all(
          assets.map(async (path) => {
            try {
              const response = await fetch(resolve(path), { cache: 'reload' });
              if (response.ok) await cache.put(resolve(path), response.clone());
            } catch {
              // A file that will not load is simply not cached.
            }
          }),
        );
        await self.skipWaiting();
      })(),
    );
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(
          names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
        );
        await self.clients.claim();
      })(),
    );
  });

  self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    const isData = url.pathname.startsWith(BASE_PATH + DATA_PREFIX);

    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        if (isData) {
          // The guide data only changes when the site is rebuilt, so a
          // cached copy is always the right one.
          const cached = await cache.match(request);
          if (cached) return cached;
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        }

        // The shell is served from the cache and refreshed in the background.
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        const response = await network;
        if (response) return response;
        return new Response('offline', { status: 503, statusText: 'offline' });
      })(),
    );
  });

  /** Cache the guide JSON and every image of the named countries. */
  async function prefetch(slugs, port) {
    const cache = await caches.open(CACHE_NAME);
    const index = await (await fetch(resolve('data/index.json'))).json();
    const wanted = slugs && slugs.length ? slugs : index.map((entry) => entry.slug);

    let done = 0;
    let total = 0;
    const queue = [];

    for (const slug of wanted) {
      const guideUrl = resolve(`data/guides/${slug}.json`);
      let guide = null;
      try {
        const response = await fetch(guideUrl, { cache: 'reload' });
        if (response.ok) {
          await cache.put(guideUrl, response.clone());
          guide = await response.json();
        }
      } catch {
        // A guide that will not load is skipped.
      }
      if (!guide) continue;

      const images = new Set();
      for (const section of guide.sections || []) {
        for (const item of section.metas || []) {
          if (item.image) images.add(item.image);
        }
      }
      if (guide.hero) images.add(guide.hero);

      for (const image of images) {
        queue.push(resolve(image));
      }
    }

    total = queue.length + wanted.length;

    for (const url of queue) {
      try {
        const cached = await cache.match(url);
        if (!cached) {
          const response = await fetch(url, { cache: 'reload' });
          if (response.ok) await cache.put(url, response.clone());
        }
      } catch {
        // A missing image is not worth stopping for.
      }
      done += 1;
      if (port) port.postMessage({ type: 'prefetch-progress', done, total });
      // Yield so the worker is not killed while it works through a long list.
      if (done % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (port) port.postMessage({ type: 'prefetch-progress', done: total, total });
    return { done: total, total };
  }

  self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'prefetch') return;
    const port = event.ports && event.ports[0];
    event.waitUntil(prefetch(data.slugs, port));
  });
}
