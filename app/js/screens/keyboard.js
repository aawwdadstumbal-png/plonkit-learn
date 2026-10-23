/**
 * Keyboard shortcut overlay — shows on ? key press.
 * Own module; no screens.js edit needed.
 */
export function setupKeyboardShortcuts() {
  const overlay = document.createElement('div');
  overlay.className = 'keyboard-overlay';
  overlay.innerHTML = `
    <div class="keyboard-box" role="dialog" aria-label="Keyboard shortcuts">
      <h3>Shortcuts</h3>
      <table><tbody>
        <tr><td>← / →</td><td>Previous / Next meta</td></tr>
        <tr><td>↑ / ↓</td><td>Scroll</td></tr>
        <tr><td>Enter</td><td>Answer / Open</td></tr>
        <tr><td>?</td><td>This help</td></tr>
        <tr><td>Esc</td><td>Close</td></tr>
      </tbody></table>
      <button onclick="this.closest('.keyboard-overlay').remove()">Close</button>
    </div>`;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(15,18,20,0.9);display:none;align-items:center;justify-content:center;';
  document.body.appendChild(overlay);

  document.addEventListener('keydown', (e) => {
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      overlay.style.display = overlay.style.display === 'flex' ? 'none' : 'flex';
    } else if (e.key === 'Escape') {
      overlay.style.display = 'none';
    }
  });
}
