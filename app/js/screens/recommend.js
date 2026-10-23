/**
 * Recommended meta — picks what to study next based on weakest / unseens.
 * Own file so it doesn't touch screens.js.
 */
export async function recommendScreen({ store, data, router, container }) {
  const { el, mount } = await import('../dom.js');
  const { metaKey, flattenMetas, pickRandom } = await import('../screens.js');
  const { showToast } = await import('../screens.js');

  try {
    const index = await data.index();
    const history = store.history();
    // Pick weakest country from stats, or random if none
    let targetSlug = index[0]?.slug;
    if (history && history.length) {
      // Find least accurate country from recent attempts
      const accuracyBySlug = {};
      for (const h of history) {
        const s = h.slug || h.answer || h.country;
        if (s) accuracyBySlug[s] = (accuracyBySlug[s] || 0) + (h.correct ? 1 : 0);
      }
      const weakest = Object.entries(accuracyBySlug).sort((a,b) => a[1]-b[1])[0];
      if (weakest) targetSlug = weakest[0];
    }
    const guide = await data.guide(targetSlug);
    const flat = flattenMetas(guide);
    const meta = flat[Math.floor(Math.random() * flat.length)];

    mount(container, el('div', { className: 'stack', 'data-testid': 'recommend-view' }, [
      el('h1', { text: 'Recommended for you' }),
      el('p', { className: 'muted', text: `Based on your stats: ${guide.title}` }),
      meta.image ? el('img', { className: 'meta-image', src: meta.image, alt: meta.text ? meta.text[0] || '' : '', loading: 'lazy', style: { maxWidth: '60vw', maxHeight: '40vh', borderRadius: '12px' } }) : el('div', { className: 'img-placeholder', text: 'No image' }),
      el('div', { className: 'btn-row' }, [
        el('a', { className: 'btn btn-accent', href: `#/meta/${targetSlug}/${meta.id}`, text: 'Open meta' }),
        el('a', { className: 'btn', href: `#/flashcard/${targetSlug}/${meta.id}`, text: 'Flashcard' }),
        el('a', { className: 'btn', href: '#/blind', text: 'Blind quiz' }),
        el('a', { className: 'btn', href: '#/', text: 'Menu' }),
      ]),
    ]));
  } catch (e) {
    mount(container, el('div', { className: 'card' }, [
      el('h2', { text: 'Could not recommend' }),
      el('p', { className: 'muted', text: String(e.message || e) }),
      el('a', { className: 'btn', href: '#/', text: 'Back to countries' }),
    ]));
  }
}
