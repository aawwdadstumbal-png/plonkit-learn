/**
 * The one module that touches the browser's own storage and globals.
 *
 * Everything else receives what it needs as an argument, which is what keeps
 * the core modules testable under node.
 */

import { createStore } from './store.js';
import { createDataClient } from './data.js';

export function createPrefs() {
  let backend = null;
  try {
    backend = window.localStorage;
    // Touch it once, so a browser that blocks storage fails here rather than
    // halfway through the first save.
    backend.getItem('plonkit-learn:probe');
  } catch {
    const memory = new Map();
    backend = {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, String(value)),
    };
  }

  return {
    store: createStore(backend),
    data: createDataClient({ base: '' }),
    base: '',
  };
}
