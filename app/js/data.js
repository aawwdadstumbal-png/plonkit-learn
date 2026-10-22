/**
 * Loading the guide data.
 *
 * The index and every guide are fetched once and kept in memory for the
 * session. The fetch function is injected so this module can be tested
 * without a browser.
 */

export function createDataClient({ base = '', fetchImpl = fetch } = {}) {
  let indexPromise = null;
  const guides = new Map();

  // The paths are relative to the document, so the app works from a
  // subdirectory as well as from the root. A base is a path prefix, and it
  // is joined with exactly one slash.
  const url = (path) => {
    const prefix = String(base).replace(/\/+$/, '');
    return prefix ? `${prefix}/${path}` : path;
  };

  async function getJson(path) {
    const target = url(path);
    const response = await fetchImpl(target);
    if (!response || !response.ok) {
      const status = response ? response.status : 'no response';
      const text = response ? response.statusText : '';
      throw new Error(`could not load ${target} (${status} ${text})`);
    }
    return response.json();
  }

  return {
    /** The country list. Fetched once. */
    index() {
      if (!indexPromise) {
        indexPromise = getJson('data/index.json').catch((error) => {
          indexPromise = null;
          throw error;
        });
      }
      return indexPromise;
    },

    /** One guide. Fetched once per slug. */
    guide(slug) {
      if (!guides.has(slug)) {
        const promise = getJson(`data/guides/${slug}.json`).catch((error) => {
          guides.delete(slug);
          throw error;
        });
        guides.set(slug, promise);
      }
      return guides.get(slug);
    },

    /**
     * Every guide, fetched a few at a time. The global quiz needs all of
     * them, and the service worker caches them as they are fetched.
     */
    async allGuides(concurrency = 8) {
      const entries = await this.index();
      const slugs = entries.map((entry) => entry.slug);
      const loaded = [];
      let position = 0;

      const worker = async () => {
        while (position < slugs.length) {
          const slug = slugs[position++];
          try {
            loaded.push(await this.guide(slug));
          } catch {
            // A guide that will not load is simply not in the pool.
          }
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, slugs.length || 1) }, worker);
      await Promise.all(workers);
      return loaded;
    },

    /** Forget everything, so the next call fetches again. */
    clearCache() {
      indexPromise = null;
      guides.clear();
    },
  };
}
