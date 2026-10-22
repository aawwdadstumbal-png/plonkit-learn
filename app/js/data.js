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

  async function getJson(url) {
    const response = await fetchImpl(url);
    if (!response || !response.ok) {
      const status = response ? response.status : 'no response';
      const text = response ? response.statusText : '';
      throw new Error(`could not load ${url} (${status} ${text})`);
    }
    return response.json();
  }

  return {
    /** The country list. Fetched once. */
    index() {
      if (!indexPromise) {
        indexPromise = getJson(`${base}/data/index.json`).catch((error) => {
          indexPromise = null;
          throw error;
        });
      }
      return indexPromise;
    },

    /** One guide. Fetched once per slug. */
    guide(slug) {
      if (!guides.has(slug)) {
        const promise = getJson(`${base}/data/guides/${slug}.json`).catch((error) => {
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
