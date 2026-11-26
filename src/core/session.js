// @ts-check
import { shuffle } from './random.js';

/** @typedef {import('./types.js').Card} Card */
/** @typedef {import('./types.js').DeckStats} DeckStats */
/** @typedef {import('./types.js').Rating} Rating */
/** @typedef {import('./types.js').ReviewState} ReviewState */

const AGAIN_OFFSET = 3;

/**
 * A card is new until its first review: it has no state, or its state was never reviewed.
 * @param {ReviewState | undefined} state
 * @returns {boolean}
 */
export function isNew(state) {
  return !state || state.lastReviewed === null;
}

/**
 * The card ids to review: due cards, oldest due first, then up to `newLimit` new cards
 * in the order `cards` is given. Suspended cards are left out.
 * @param {object} options
 * @param {readonly Card[]} options.cards
 * @param {Map<string, ReviewState>} options.states
 * @param {number} options.cutoff Cards due at or before this time are due.
 * @param {number} options.newLimit
 * @returns {string[]}
 */
export function buildReviewQueue({ cards, states, cutoff, newLimit }) {
  /** @type {{ id: string, due: number, order: number }[]} */
  const due = [];
  /** @type {string[]} */
  const fresh = [];
  cards.forEach((card, order) => {
    const state = states.get(card.id);
    if (state?.suspended) return;
    if (!state || isNew(state)) fresh.push(card.id);
    else if (state.due <= cutoff) due.push({ id: card.id, due: state.due, order });
  });
  due.sort((a, b) => a.due - b.due || a.order - b.order);
  return [...due.map((entry) => entry.id), ...fresh.slice(0, Math.max(0, newLimit))];
}

/**
 * Drops the head of the queue. For "again" it comes back three places later, or last.
 * @param {readonly string[]} queue
 * @param {Rating} rating
 * @returns {string[]}
 */
export function advanceQueue(queue, rating) {
  if (queue.length === 0) return [];
  const [head, ...rest] = queue;
  if (rating !== 'again') return rest;
  const at = Math.min(AGAIN_OFFSET, rest.length);
  return [...rest.slice(0, at), head, ...rest.slice(at)];
}

/**
 * Every card id, shuffled, for a practice run that does not touch scheduling.
 * @param {readonly Card[]} cards
 * @param {() => number} random
 * @returns {string[]}
 */
export function buildPracticeQueue(cards, random) {
  return shuffle(
    cards.map((card) => card.id),
    random,
  );
}

/**
 * Counts for a deck page. A suspended card counts only as suspended.
 * @param {readonly Card[]} cards
 * @param {Map<string, ReviewState>} states
 * @param {number} cutoff
 * @returns {DeckStats}
 */
export function deckStats(cards, states, cutoff) {
  /** @type {DeckStats} */
  const stats = { total: cards.length, due: 0, new: 0, suspended: 0 };
  for (const card of cards) {
    const state = states.get(card.id);
    if (state?.suspended) stats.suspended++;
    else if (!state || isNew(state)) stats.new++;
    else if (state.due <= cutoff) stats.due++;
  }
  return stats;
}
