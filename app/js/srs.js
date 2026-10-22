/**
 * A light SM-2 scheduler.
 *
 * Every meta the user has been quizzed on has a box and a due date. Right
 * answers push it further out, wrong answers bring it back to the start and
 * make it due immediately.
 */

export const SRS_INTERVALS = [1, 2, 4, 8, 16, 32];
const DAY = 86400000;

export function initialState() {
  return { box: 0, due: 0 };
}

/**
 * The next state for a meta, given whether the answer was right.
 * The caller passes `now` so the function stays pure and testable.
 */
export function review(state, correct, now = Date.now()) {
  const box = Math.max(0, Math.min(5, Number(state && state.box) || 0));
  if (correct) {
    const next = Math.min(box + 1, 5);
    return { box: next, due: now + SRS_INTERVALS[next] * DAY };
  }
  return { box: 0, due: now };
}

export function isDue(state, now = Date.now()) {
  if (!state) return false;
  const due = Number(state.due) || 0;
  return due > 0 && due <= now;
}
