/**
 * Bookmark / folder view — all starred metas with filter.
 * Own file: don't edit screens.js.
 */
export async function bookmarkScreen({ store, data, router, container }) {
  const { el, mount } = await import('../dom.js');
  const { metaKey, flattenMetas } = await import('../screens.js');

  try {
    const index = await data.index();
    const titles = new Map(index.map(e => [e.slug, e.title]));
    const starred = [];
    for (const key of store.bookmarkedKeys()) {
      const [slug, metaId] = key.split(':');
      const guide = await data.guide(slug);
      const flat = flattenMetas(guide);
      const meta = flat.find(m => m.id === metaId);
      if (meta) starred.push({ key, slug, metaId, country: titles.get(slug) || slug, text: (meta.text || []).slice(0, 2).join(' ').slice(0, 120), image: meta.image });
    }

    const list = el('div', { className: 'list', 'data-testid': 'bookmark-list' });
    for (const item of starred) {
      list.appendChild(el('div', { className: 'list-row' }, [
        item.image ? el('img', { src: item.image, className: 'bookmark-thumb', alt: '', loading: 'lazy', style: 'width:48px;height:48px;object-fit:cover;border-radius:4px;' }) : null,
        el('div', { className: 'grow' }, [
          el('a', { className: 'btn', href: `#/meta/${item.slug}/${item.metaId}`, text: item.country + ' — ' + item.metaId }),
          el('div', { className: 'muted small', text: item.text || 'No text snippet' }),
        ]),
        el('button', { className: 'btn btn-danger', text: 'Remove', onClick: () => { store.toggleBookmark(item.key); bookmarkScreen({ store, data, router, container }); showToast('Unstarred'); } }),
      ]));
    }

    const query = el('input', { className: 'search', type: 'search', placeholder: 'Filter starred...', 'aria-label': 'Filter starred metas' });
    query.addEventListener('input', () => {
      const needle = query.value.toLowerCase();
      for (const child of list.children) {
        child.style.display = (child.textContent || '').toLowerCase().includes(needle) ? '' : 'none';
      }
    });

    mount(container, el('div', { className: 'stack', 'data-testid': 'bookmark-view' }, [
      el('h1', { text: 'Starred metas' }),
      el('p', { className: 'muted small', text: `${starred.length} starred meta${starred.length === 1 ? '' : 's'}` }),
      query,
      list.length ? list : el('p', { className: 'empty', text: 'Nothing starred yet. Star metas from the meta screen.' }),
      el('div', { className: 'btn-row' }, [
        el('a', { className: 'btn', href: '#/', text: 'Menu' }),
      ]),
    ]));
  } catch (e) {
    mount(container, el('div', { className: 'card' }, [
      el('h2', { text: 'Could not load bookmarks' }),
      el('p', { className: 'muted', text: String(e.message || e) }),
    ]));
  }
}
