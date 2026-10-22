/**
 * The user's state: what they have seen, starred, noted, and how well they
 * know each meta.
 *
 * The backend is injected so this module never touches localStorage itself.
 * The app passes window.localStorage; the tests pass an in-memory object.
 * That keeps the module importable by node and testable without a browser.
 */

const DEFAULT_KEY = 'plonkit-learn:v1';
const HISTORY_LIMIT = 2000;

function emptyState() {
  return {
    seen: {},
    bookmarked: {},
    notes: {},
    srs: {},
    history: [],
    streak: { current: 0, best: 0 },
  };
}

/**
 * Coerce anything read off disk into a well formed state document.
 * A missing, malformed or partial document must never crash the app.
 */
function normaliseState(raw) {
  const state = emptyState();
  if (!raw || typeof raw !== 'object') return state;

  if (raw.seen && typeof raw.seen === 'object') {
    for (const [key, value] of Object.entries(raw.seen)) {
      if (value) state.seen[key] = true;
    }
  }
  if (raw.bookmarked && typeof raw.bookmarked === 'object') {
    for (const [key, value] of Object.entries(raw.bookmarked)) {
      if (value) state.bookmarked[key] = true;
    }
  }
  if (raw.notes && typeof raw.notes === 'object') {
    for (const [key, value] of Object.entries(raw.notes)) {
      if (typeof value === 'string' && value !== '') state.notes[key] = value;
    }
  }
  if (raw.srs && typeof raw.srs === 'object') {
    for (const [key, value] of Object.entries(raw.srs)) {
      if (value && typeof value === 'object') {
        const box = Number(value.box) || 0;
        const due = Number(value.due) || 0;
        state.srs[key] = { box, due };
      }
    }
  }
  if (Array.isArray(raw.history)) {
    state.history = raw.history
      .filter((entry) => entry && typeof entry === 'object')
      .slice(-HISTORY_LIMIT)
      .map((entry) => ({
        country: String(entry.country || ''),
        metaId: String(entry.metaId || ''),
        ok: Boolean(entry.ok),
        at: Number(entry.at) || 0,
      }));
  }
  if (raw.streak && typeof raw.streak === 'object') {
    state.streak = {
      current: Number(raw.streak.current) || 0,
      best: Number(raw.streak.best) || 0,
    };
  }
  return state;
}

export function createStore(backend, { key = DEFAULT_KEY } = {}) {
  if (!backend || typeof backend.getItem !== 'function' || typeof backend.setItem !== 'function') {
    throw new TypeError('createStore needs a backend with getItem and setItem');
  }

  let corrupt = null;
  let state = read();

  function read() {
    let text = null;
    try {
      text = backend.getItem(key);
    } catch {
      return emptyState();
    }
    if (!text) return emptyState();
    try {
      return normaliseState(JSON.parse(text));
    } catch {
      corrupt = text;
      return emptyState();
    }
  }

  function write() {
    try {
      backend.setItem(key, JSON.stringify(state));
    } catch {
      // A full or unavailable storage must not take the app down.
    }
  }

  function save() {
    write();
  }

  return {
    /** The raw stored document, for export. */
    export() {
      return JSON.parse(JSON.stringify(state));
    },

    /** Replace the state, ignoring anything not recognised. */
    import(obj) {
      state = normaliseState(obj);
      save();
    },

    reset() {
      state = emptyState();
      save();
    },

    /** The value that could not be parsed, if there was one. */
    corruptValue() {
      return corrupt;
    },

    isSeen(metaKey) {
      return Boolean(state.seen[metaKey]);
    },

    markSeen(metaKey) {
      if (!state.seen[metaKey]) {
        state.seen[metaKey] = true;
        save();
      }
    },

    seenCount() {
      return Object.keys(state.seen).length;
    },

    seenKeys() {
      return Object.keys(state.seen);
    },

    isBookmarked(metaKey) {
      return Boolean(state.bookmarked[metaKey]);
    },

    toggleBookmark(metaKey) {
      const next = !state.bookmarked[metaKey];
      if (next) {
        state.bookmarked[metaKey] = true;
      } else {
        delete state.bookmarked[metaKey];
      }
      save();
      return next;
    },

    bookmarkCount() {
      return Object.keys(state.bookmarked).length;
    },

    bookmarkedKeys() {
      return Object.keys(state.bookmarked);
    },

    note(metaKey) {
      return state.notes[metaKey] || '';
    },

    setNote(metaKey, text) {
      const value = String(text || '');
      if (value === '') {
        delete state.notes[metaKey];
      } else {
        state.notes[metaKey] = value;
      }
      save();
    },

    noteCount() {
      return Object.keys(state.notes).length;
    },

    notedKeys() {
      return Object.keys(state.notes);
    },

    srs(metaKey) {
      return state.srs[metaKey] || { box: 0, due: 0 };
    },

    setSrs(metaKey, srsState) {
      state.srs[metaKey] = {
        box: Number(srsState && srsState.box) || 0,
        due: Number(srsState && srsState.due) || 0,
      };
      save();
    },

    srsEntries() {
      return Object.entries(state.srs);
    },

    pushHistory(entry) {
      state.history.push({
        country: String(entry.country || ''),
        metaId: String(entry.metaId || ''),
        ok: Boolean(entry.ok),
        at: Number(entry.at) || Date.now(),
      });
      if (state.history.length > HISTORY_LIMIT) {
        state.history = state.history.slice(-HISTORY_LIMIT);
      }
      save();
    },

    history() {
      return state.history.slice();
    },

    streak() {
      return { ...state.streak };
    },

    setStreak(value) {
      const current = Number(value && value.current) || 0;
      const best = Math.max(Number(value && value.best) || 0, current);
      state.streak = { current, best };
      save();
    },
  };
}
