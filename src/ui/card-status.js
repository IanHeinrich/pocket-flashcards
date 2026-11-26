// @ts-check
import { describeInterval } from '../core/scheduler.js';
import { isNew } from '../core/session.js';

/** @typedef {import('../core/types.js').ReviewSession} ReviewSession */
/** @typedef {import('../core/types.js').ReviewState} ReviewState */

/**
 * @typedef {object} CardStatus
 * @property {'suspended' | 'new' | 'due' | 'scheduled'} kind
 * @property {string} label Such as "New", "Due" or "Due in 3d".
 */

/**
 * A card's status for the deck page, in the same order of precedence as `deckStats`:
 * suspended, then new, then due by the cutoff, else when it is next due.
 * @param {ReviewState | undefined} state
 * @param {number} now
 * @param {number} cutoff The end of today: cards due by then are due.
 * @returns {CardStatus}
 */
export function cardStatus(state, now, cutoff) {
  if (state?.suspended) return { kind: 'suspended', label: 'Suspended' };
  if (!state || isNew(state)) return { kind: 'new', label: 'New' };
  if (state.due <= cutoff) return { kind: 'due', label: 'Due' };
  return { kind: 'scheduled', label: `Due in ${describeInterval(state.due - now)}` };
}

/**
 * How many cards left in a review are due and how many are new.
 * @param {Pick<ReviewSession, 'queue' | 'states'>} session
 * @returns {{ due: number, new: number }}
 */
export function queueCounts({ queue, states }) {
  const fresh = queue.filter((id) => isNew(states.get(id))).length;
  return { due: queue.length - fresh, new: fresh };
}

/**
 * When the next card is due, for a review with nothing left today.
 * @param {number} due
 * @param {number} now
 * @returns {string} Such as "Next card due in 3d".
 */
export function describeNextDue(due, now) {
  return `Next card due in ${describeInterval(Math.max(0, due - now))}`;
}
