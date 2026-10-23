/**
 * Learning / Mastered bookmark view — split starred items by study state.
 * Own file; uses existing bookmark store keys.
 */
export async function learningScreen({ store, data, router, container }) {
  const { el, mount } = await import('../dom.js');
  try {
    const index = await data.index();
    const titles = new Map(index.map(e => [e.slug, e.title]));
    const all = [];
    for (const key of store.bookmarkedKeys()) {
      const isLearning = key.startsWith('learning:');
      const cleanKey = isLearning ? key.slice('learning:'.length) : key;
      const [slug, metaId] = cleanKey.split(':');
      all.push({ key: cleanKey, slug, metaId, country: titles.get(slug) || slug, state: isLearning ? 'learning' : 'mastered' });
    }
    const learning = all.filter(i => i.state === 'learning');
    const mastered = all.filter(i => i.state === 'mastered');
    const makeRow = (item) => el('div', { className: 'list-row' }, [
      el('span', { className: 'chip', text: item.country || item.slug }),
      el('a', { className: 'btn', href: `#/meta/${item.slug}/${item.metaId}`, text: item.metaId }),
      el('button', { className: 'btn btn-small', text: item.state === 'learning' ? 'Mark mastered' : 'Mark learning', onClick: () => { store.toggleBookmark('learning:' + item.key); learningScreen({ store, data, router, container }); showToast('Updated'); } }),
    ]);
    mount(container, el('div', { className: 'stack', 'data-testid': 'learning-view' }, [
      el('h1', { text: 'Learning / Mastered' }),
      el('h2', { text: `Still learning (${learning.length})` }),
      learning.length ? el('div', { className: 'list' }, learning.map(makeRow)) : el('p', { className: 'empty', text: 'Nothing still learning — great!' }),
      el('h2', { text: `Mastered (${mastered.length})` }),
      mastered.length ? el('div', { className: 'list' }, mastered.map(makeRow)) : el('p', { className: 'muted small', text: 'Nothing mastered yet.' }),
      el('a', { className: 'btn', href: '#/bookmark', text: 'Back to bookmarks' }),
    ]));
  } catch (e) {
    mount(container, el('div', { className: 'card' }, [el('h2', { text: 'Could not load' }), el('p', { className: 'muted', text: String(e.message || e) })]));
  }
}
