/**
 * A small Markdown renderer for the guide text.
 *
 * The source uses only bold, italic, links and bare URLs, so that is all this
 * handles. The input is escaped before any rule is applied, so nothing from
 * the guide can ever become a tag.
 */

const SAFE_SCHEME = /^(https?:|mailto:)/i;

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url) {
  const trimmed = String(url || '').trim();
  return SAFE_SCHEME.test(trimmed) ? trimmed : null;
}

/** Turn one escaped line into inline HTML. */
function renderInline(escaped) {
  let html = escaped;

  // [label](url)
  html = html.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (match, label, url) => {
    const safe = safeUrl(url);
    // An unsafe scheme is dropped entirely rather than shown, so a hostile
    // URL never survives even as inert text.
    if (!safe) return label;
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // **bold**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // *italic* and _italic_
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');

  // bare urls
  html = html.replace(/(^|[\s(])((?:https?:\/\/)[^\s<>"']+)/g, (match, lead, url) => {
    const trailing = url.match(/[.,;:!?)\]]+$/);
    const clean = trailing ? url.slice(0, -trailing[0].length) : url;
    const tail = trailing ? trailing[0] : '';
    return `${lead}<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${tail}`;
  });

  return html;
}

/**
 * Render Markdown to an HTML string.
 * Paragraphs are separated by a blank line or a single newline.
 */
export function renderMarkdown(source) {
  if (!source) return '';
  const escaped = escapeHtml(source);
  const paragraphs = escaped.split(/\n{2,}|\n/);
  return paragraphs
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map((paragraph) => `<p>${renderInline(paragraph)}</p>`)
    .join('');
}

/** The source with all Markdown syntax removed. */
export function plainText(source) {
  if (!source) return '';
  return String(source)
    .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a meta's paragraphs into ordinary ones and NOTE ones.
 * A paragraph is a note when it starts with NOTE, or when it is wrapped in
 * underscores and mentions a note.
 */
export function splitNoteParagraphs(paragraphs) {
  const text = [];
  const notes = [];
  for (const paragraph of paragraphs || []) {
    const trimmed = String(paragraph || '').trim();
    if (!trimmed) continue;
    const startsWithNote = /^note\b/i.test(trimmed);
    const wrapped = /^_.*_$/.test(trimmed) && /\bnote\b/i.test(trimmed);
    if (startsWithNote || wrapped) {
      notes.push(trimmed);
    } else {
      text.push(trimmed);
    }
  }
  return { text, notes };
}
