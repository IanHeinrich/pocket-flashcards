// @ts-check
import { h } from '../dom.js';

/** @typedef {import('../../core/types.js').Rating} Rating */

/** @type {readonly { rating: Rating, label: string, key: string }[]} */
export const RATINGS = [
  { rating: 'again', label: 'Again', key: '1' },
  { rating: 'hard', label: 'Hard', key: '2' },
  { rating: 'good', label: 'Good', key: '3' },
  { rating: 'easy', label: 'Easy', key: '4' },
];

/**
 * The four rating buttons, each with when the card comes back.
 * @param {Partial<Record<Rating, string>>} intervals Such as `{ good: '3d' }`.
 * @param {(rating: Rating) => void} onRate
 * @returns {HTMLElement}
 */
export function ratingBar(intervals, onRate) {
  return h(
    'div',
    {
      class: 'rating-bar',
      attrs: { role: 'group', 'aria-label': 'How well did you remember it?', tabindex: -1 },
    },
    RATINGS.map(({ rating, label, key }) => {
      const interval = intervals[rating];
      return h(
        'button',
        {
          class: 'rating-btn',
          dataset: { rating },
          attrs: {
            type: 'button',
            'aria-keyshortcuts': key,
            'aria-label': interval ? `${label}, comes back in ${interval}` : label,
          },
          on: { click: () => onRate(rating) },
        },
        h('span', null, label),
        interval &&
          h('span', { class: 'rating-interval', attrs: { 'aria-hidden': 'true' } }, interval),
      );
    }),
  );
}

/**
 * "Missed it" and "Got it" for practice.
 * @param {(correct: boolean) => void} onAnswer
 * @returns {HTMLElement}
 */
export function practiceBar(onAnswer) {
  /**
   * @param {boolean} correct
   * @param {string} label
   * @param {string} key
   */
  const button = (correct, label, key) =>
    h(
      'button',
      {
        class: 'rating-btn',
        dataset: { rating: correct ? 'good' : 'again' },
        attrs: { type: 'button', 'aria-keyshortcuts': key },
        on: { click: () => onAnswer(correct) },
      },
      label,
    );
  return h(
    'div',
    {
      class: 'rating-bar two',
      attrs: { role: 'group', 'aria-label': 'Did you know it?', tabindex: -1 },
    },
    button(false, 'Missed it', '1'),
    button(true, 'Got it', '2'),
  );
}
