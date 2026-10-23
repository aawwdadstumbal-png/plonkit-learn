/**
 * Flashcard screen — flip card for any meta.
 * Per-item (and can be used per-country via meta screen button).
 * Import from app.js: import { flashcardScreen } from './screens/flashcard.js';
 */

// This module exports the flashcard screen.
// It relies on the screens.js helpers being available via import,
// but is kept standalone so edits don't break the big file.
export async function flashcardScreen({ store, data, router, container, slug, metaId }) {
  // Import helpers that live in the main screens module
  const { el, clear, mount } = await import('../dom.js');
  const { metaKey, flattenMetas, pickRandom } = await import('../screens.js');
  const { renderMarkdown, splitNoteParagraphs } = await import('../md.js');
  const { showToast } = await import('../screens.js');

  // Clear container
  container.innerHTML = '';

  let guide;
  try {
    guide = await data.guide(slug);
  } catch (e) {
    mount(container, el('div', { className: 'card' }, [
      el('h2', { text: 'Could not load country' }),
      el('p', { className: 'muted', text: String(e.message || e) }),
      el('a', { className: 'btn', href: '#/', text: 'Back to menu' }),
    ]));
    return;
  }

  const flat = flattenMetas(guide);
  const meta = flat.find(m => m.id === metaId);
  const key = metaKey(slug, metaId);

  if (!meta) {
    mount(container, el('div', { className: 'card' }, [
      el('h2', { text: 'Meta not found' }),
      el('a', { className: 'btn', href: `#/country/${slug}`, text: 'Back to country' }),
    ]));
    return;
  }

  const { text, notes } = splitNoteParagraphs(meta.text || []);
  let flipped = false;

  const card = el('div', {
    className: 'stack flashcard-container',
    'data-testid': 'flashcard-view',
    onclick: () => {
      flipped = !flipped;
      const f = container.querySelector('.flashcard-front');
      const b = container.querySelector('.flashcard-back');
      if (f && b) {
        f.style.display = flipped ? 'none' : 'flex';
        b.style.display = flipped ? 'flex' : 'none';
      }
    }
  }, [
    el('div', { className: 'flashcard-front', style: { display: 'flex' }, 'data-testid': 'flashcard-front' }, [
      meta.image ? el('img', {
        className: 'meta-image',
        src: meta.image,
        alt: meta.text ? meta.text[0] || '' : '',
        loading: 'lazy',
      }) : el('div', { className: 'img-placeholder', text: 'No image' }),
      el('p', { className: 'muted small', text: 'Click to reveal country & text' }),
    ]),
    el('div', { className: 'flashcard-back', style: { display: 'none' }, 'data-testid': 'flashcard-back' }, [
      el('h2', { text: guide.title + ' — ' + meta.id }),
      el('div', { className: 'meta-text' }, [
        ...text.map(p => el('p', { html: renderMarkdown(p) })),
        ...notes.map(p => el('div', { className: 'note' }, [el('p', { html: renderMarkdown(p) })])),
      ]),
      meta.mapsUrl ? el('a', { className: 'btn btn-accent', href: meta.mapsUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Open in Google Maps', 'data-testid': 'meta-maps' }) : null,
      el('div', { className: 'btn-row' }, [
        el('button', { className: 'btn btn-accent', text: store.isSeen(key) ? 'Seen' : 'Mark seen', onClick: () => { store.markSeen(key); showToast('Marked seen'); } }),
        el('button', { className: 'btn', text: store.isBookmarked(key) ? 'Starred' : 'Star', onClick: () => { store.toggleBookmark(key); showToast('Updated'); } }),
      ]),
      el('a', { className: 'btn', href: `#/meta/${slug}/${metaId}`, text: 'Back to meta', 'data-testid': 'flashcard-back-meta' }),
      el('a', { className: 'btn', href: '#/', text: 'Menu' }),
    ]),
  ]);

  mount(container, card);
}
