/**
 * Offline status — shows which meta images are cached vs missing locally.
 * Own file; reads disk via fetch/cached check (simplified).
 */
export async function offlineStatusScreen({ store, data, router, container }) {
  const { el, mount } = await import('../dom.js');
  try {
    const index = await data.index();
    const total = index.reduce((s, e) => s + (e.metaCount || 0), 0);
    let present = 0;
    let missing = 0;
    const missingList = [];
    // Simplified: we don't have a direct file-listing API from browser,
    // so we report based on known index counts and a best-effort check.
    // For a real implementation, service-worker cached count or server check.
    // Here we show the stats and remind user to run warm_cache.
    mount(container, el('div', { className: 'stack', 'data-testid': 'offline-status' }, [
      el('h1', { text: 'Offline status' }),
      el('div', { className: 'card' }, [
        el('h2', { text: 'Image cache' }),
        el('div', { className: 'stat-row' }, [
          el('div', { className: 'stat' }, [
            el('div', { className: 'value', text: String(total) }),
            el('div', { className: 'label', text: 'Expected meta images' }),
          ]),
          el('div', { className: 'stat' }, [
            el('div', { className: 'value', text: 'Not checked from browser' }),
            el('div', { className: 'label', text: 'Cache status' }),
          ]),
        ]),
        el('p', { className: 'muted', text: 'The app uses a service worker to cache guides and meta images. To verify which images are cached, open DevTools → Application → Cache Storage.' }),
        el('p', { className: 'muted small', text: 'Run python tools/warm_cache.py --fetch on the computer to download missing meta images.' }),
      ]),
      el('div', { className: 'btn-row' }, [
        el('a', { className: 'btn', href: '#/', text: 'Menu' }),
        el('a', { className: 'btn btn-info', href: '#/bookmark', text: 'Bookmarks' }),
      ]),
    ]));
  } catch (e) {
    mount(container, el('div', { className: 'card' }, [
      el('h2', { text: 'Could not load status' }),
      el('p', { className: 'muted', text: String(e.message || e) }),
    ]));
  }
}
