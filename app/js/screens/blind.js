/**
 * Blind quiz — type the country name instead of picking options.
 * Harder mode for serious study.
 */
export async function blindScreen({ store, data, router, container }) {
  // Minimal standalone screen; relies on screens.js being loaded for el/mount
  // Fallback: import from module
  const { el, mount } = await import('../dom.js');
  const { buildPool, scoreAnswer } = await import('../quiz.js');

  let correctSlug = '';
  let correctTitle = '';
  let attempt = '';

  const showPrompt = (guide) => {
    const meta = guide.sections[0].metas[0];
    correctSlug = guide.slug;
    correctTitle = guide.title;
    container.innerHTML = '';
    mount(container, el('div', { className: 'stack', 'data-testid': 'blind-view' }, [
      el('h1', { text: 'Blind Quiz — Type the country' }),
      meta.image ? el('img', { className: 'quiz-image', src: meta.image, alt: '', loading: 'lazy' }) : el('div', { className: 'img-placeholder', text: 'No image' }),
      el('p', { className: 'muted', text: 'Type the country name (or code)' }),
      el('input', {
        className: 'search',
        type: 'text',
        placeholder: 'e.g. Japan, JP...',
        'data-testid': 'blind-input',
        onKeyDown: (e) => { if (e.key === 'Enter') checkAnswer(); }
      }),
      el('button', { className: 'btn btn-accent', text: 'Answer', 'data-testid': 'blind-answer', onClick: checkAnswer }),
      el('div', { className: 'btn-row' }, [
        el('a', { className: 'btn', href: '#/', text: 'Menu' }),
        el('a', { className: 'btn', href: '#/quiz', text: 'Options quiz' }),
      ]),
    ]));
  };

  const checkAnswer = () => {
    const input = container.querySelector('[data-testid="blind-input"]');
    const val = (input ? input.value : '').trim().toLowerCase();
    const ok = val === correctSlug.toLowerCase() || val === correctTitle.toLowerCase() || val === (correctSlug.split('-')[0] || '').toLowerCase();
    mount(container, el('div', { className: 'card' }, [
      el('h2', { text: ok ? 'Correct!' : 'Not quite' }),
      el('p', { className: 'muted', text: ok ? `That is ${correctTitle}.` : `The answer was ${correctTitle}.` }),
      el('a', { className: 'btn btn-accent', href: '#/quiz', text: 'Another question' }),
      el('a', { className: 'btn', href: '#/', text: 'Menu' }),
    ]));
  };

  try {
    const index = await data.index();
    const guides = await data.allGuides();
    const pool = buildPool({ guides, scope: 'all' });
    const q = pool[Math.floor(Math.random() * pool.length)];
    const guide = guides.find(g => g.slug === q.answer);
    if (guide) showPrompt(guide);
    else mount(container, el('div', { className: 'card' }, [el('h2', { text: 'No guides loaded' })]));
  } catch (e) {
    mount(container, el('div', { className: 'card' }, [
      el('h2', { text: 'Could not start blind quiz' }),
      el('p', { className: 'muted', text: String(e.message || e) }),
    ]));
  }
}
