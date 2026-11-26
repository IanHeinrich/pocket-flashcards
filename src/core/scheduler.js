// @ts-check

/** @typedef {import('./types.js').Rating} Rating */
/** @typedef {import('./types.js').ReviewState} ReviewState */
/** @typedef {import('./types.js').Scheduler} Scheduler */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MIN_EASE = 1.3;
const START_EASE = 2.5;
const AGAIN_DELAY = 10 * MINUTE;

/** @type {readonly Rating[]} */
const RATINGS = ['again', 'hard', 'good', 'easy'];

/**
 * SM-2 as described in docs/architecture.md.
 * @type {Scheduler}
 */
export const sm2 = {
  id: 'sm2',
  initialState,
  review,
  preview,
};

/**
 * @param {string} cardId
 * @param {number} now
 * @returns {ReviewState}
 */
function initialState(cardId, now) {
  return {
    cardId,
    due: now,
    interval: 0,
    ease: START_EASE,
    reps: 0,
    lapses: 0,
    lastReviewed: null,
    suspended: false,
  };
}

/**
 * @param {ReviewState} state
 * @param {Rating} rating
 * @param {number} now
 * @returns {ReviewState}
 */
function review(state, rating, now) {
  if (rating === 'again') {
    return {
      ...state,
      due: now + AGAIN_DELAY,
      interval: 0,
      ease: lowerEase(state.ease, 0.2),
      reps: 0,
      lapses: state.reps > 0 ? state.lapses + 1 : state.lapses,
      lastReviewed: now,
    };
  }
  const interval = nextInterval(state, rating);
  return {
    ...state,
    due: now + interval * DAY,
    interval,
    ease: nextEase(state.ease, rating),
    reps: state.reps + 1,
    lastReviewed: now,
  };
}

/**
 * @param {ReviewState} state
 * @param {number} now
 * @returns {Record<Rating, number>}
 */
function preview(state, now) {
  /** @type {Record<Rating, number>} */
  const result = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const rating of RATINGS) result[rating] = review(state, rating, now).due - now;
  return result;
}

/**
 * @param {ReviewState} state
 * @param {Exclude<Rating, 'again'>} rating
 * @returns {number} Days.
 */
function nextInterval({ reps, interval, ease }, rating) {
  if (rating === 'hard') return reps === 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2));
  if (rating === 'good') {
    if (reps === 0) return 1;
    if (reps === 1) return 3;
    return Math.max(interval + 1, Math.round(interval * ease));
  }
  return reps === 0 ? 4 : Math.max(interval + 1, Math.round(interval * ease * 1.3));
}

/**
 * @param {number} ease
 * @param {Exclude<Rating, 'again'>} rating
 * @returns {number}
 */
function nextEase(ease, rating) {
  if (rating === 'hard') return lowerEase(ease, 0.15);
  if (rating === 'easy') return roundEase(ease + 0.15);
  return ease;
}

/**
 * @param {number} ease
 * @param {number} step
 * @returns {number}
 */
function lowerEase(ease, step) {
  return Math.max(MIN_EASE, roundEase(ease - step));
}

/**
 * Rounds to hundredths so repeated steps of 0.15 and 0.2 do not drift.
 * @param {number} ease
 * @returns {number}
 */
function roundEase(ease) {
  return Math.round(ease * 100) / 100;
}

/**
 * A short label for a wait, such as "10m", "3d", "2mo" or "1.2y".
 * @param {number} ms
 * @returns {string}
 */
export function describeInterval(ms) {
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  if (minutes < 60) return `${minutes}m`;
  if (Math.round(ms / HOUR) < 24) return `${Math.round(ms / HOUR)}h`;
  if (Math.round(ms / DAY) < 30) return `${Math.round(ms / DAY)}d`;
  const months = roundToTenth(ms / DAY / 30);
  if (months < 12) return `${months}mo`;
  return `${roundToTenth(ms / DAY / 365)}y`;
}

/**
 * @param {number} value
 * @returns {number} Rounded to one decimal place; a template literal prints it without a trailing ".0".
 */
function roundToTenth(value) {
  return Math.round(value * 10) / 10;
}
