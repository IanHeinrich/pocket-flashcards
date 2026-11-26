// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceQueue,
  buildPracticeQueue,
  buildReviewQueue,
  deckStats,
  isNew,
} from '../../src/core/session.js';
import { DAY, FIXED_NOW, HOUR, makeCard, makeState, rng } from '../helpers.js';

/** @typedef {import('../../src/core/types.js').ReviewState} ReviewState */

const CUTOFF = FIXED_NOW + 12 * HOUR;
const cards = ['paris', 'berlin', 'madrid', 'rome', 'lisbon', 'vienna'].map((city, position) =>
  makeCard({ id: `c_${city}`, front: `Capital: ${city}`, back: city, position }),
);

/**
 * @param {Record<string, Partial<ReviewState>>} entries
 * @returns {Map<string, ReviewState>}
 */
function statesFor(entries) {
  return new Map(
    Object.entries(entries).map(([cardId, overrides]) => [
      cardId,
      makeState({ cardId, lastReviewed: FIXED_NOW - DAY, ...overrides }),
    ]),
  );
}

describe('isNew', () => {
  it('is true for a card with no state', () => {
    assert.equal(isNew(undefined), true);
  });

  it('is true for a state that was never reviewed', () => {
    assert.equal(isNew(makeState({ lastReviewed: null, suspended: true })), true);
  });

  it('is false once the card has been reviewed', () => {
    assert.equal(isNew(makeState({ lastReviewed: FIXED_NOW })), false);
  });
});

describe('buildReviewQueue', () => {
  it('lists due cards oldest due first, then new cards in the given order', () => {
    const states = statesFor({
      c_paris: { due: FIXED_NOW },
      c_berlin: { due: FIXED_NOW - 2 * DAY },
      c_madrid: { due: FIXED_NOW - DAY },
    });
    const queue = buildReviewQueue({ cards, states, cutoff: CUTOFF, newLimit: 10 });
    assert.deepEqual(queue, ['c_berlin', 'c_madrid', 'c_paris', 'c_rome', 'c_lisbon', 'c_vienna']);
  });

  it('includes cards due later today, up to the cutoff', () => {
    const states = statesFor({
      c_paris: { due: CUTOFF },
      c_berlin: { due: CUTOFF + 1 },
    });
    const queue = buildReviewQueue({ cards, states, cutoff: CUTOFF, newLimit: 0 });
    assert.deepEqual(queue, ['c_paris']);
  });

  it('keeps card order for cards due at the same time', () => {
    const states = statesFor({
      c_madrid: { due: FIXED_NOW },
      c_paris: { due: FIXED_NOW },
      c_berlin: { due: FIXED_NOW },
    });
    const queue = buildReviewQueue({ cards, states, cutoff: CUTOFF, newLimit: 0 });
    assert.deepEqual(queue, ['c_paris', 'c_berlin', 'c_madrid']);
  });

  it('adds no more new cards than the limit', () => {
    const queue = buildReviewQueue({ cards, states: new Map(), cutoff: CUTOFF, newLimit: 2 });
    assert.deepEqual(queue, ['c_paris', 'c_berlin']);
  });

  it('treats a negative limit as zero', () => {
    const queue = buildReviewQueue({ cards, states: new Map(), cutoff: CUTOFF, newLimit: -3 });
    assert.deepEqual(queue, []);
  });

  it('does not count due cards against the new-card limit', () => {
    const states = statesFor({ c_vienna: { due: FIXED_NOW }, c_lisbon: { due: FIXED_NOW } });
    const queue = buildReviewQueue({ cards, states, cutoff: CUTOFF, newLimit: 1 });
    assert.deepEqual(queue, ['c_lisbon', 'c_vienna', 'c_paris']);
  });

  it('treats a state that was never reviewed as new', () => {
    const states = new Map([
      ['c_paris', makeState({ cardId: 'c_paris', lastReviewed: null, due: FIXED_NOW - DAY })],
    ]);
    const queue = buildReviewQueue({ cards, states, cutoff: CUTOFF, newLimit: 1 });
    assert.deepEqual(queue, ['c_paris']);
  });

  it('leaves out suspended cards, due or new', () => {
    const states = new Map([
      ['c_paris', makeState({ cardId: 'c_paris', lastReviewed: FIXED_NOW, suspended: true })],
      ['c_berlin', makeState({ cardId: 'c_berlin', lastReviewed: null, suspended: true })],
    ]);
    const queue = buildReviewQueue({ cards, states, cutoff: CUTOFF, newLimit: 2 });
    assert.deepEqual(queue, ['c_madrid', 'c_rome']);
  });

  it('returns an empty queue for no cards', () => {
    assert.deepEqual(
      buildReviewQueue({ cards: [], states: new Map(), cutoff: CUTOFF, newLimit: 20 }),
      [],
    );
  });
});

describe('advanceQueue', () => {
  const queue = ['a', 'b', 'c', 'd', 'e'];

  it('drops the head for hard, good and easy', () => {
    for (const rating of /** @type {const} */ (['hard', 'good', 'easy'])) {
      assert.deepEqual(advanceQueue(queue, rating), ['b', 'c', 'd', 'e']);
    }
  });

  it('brings a card rated again back three places later', () => {
    assert.deepEqual(advanceQueue(queue, 'again'), ['b', 'c', 'd', 'a', 'e']);
  });

  it('puts a card rated again last when fewer than three cards remain', () => {
    assert.deepEqual(advanceQueue(['a', 'b', 'c'], 'again'), ['b', 'c', 'a']);
    assert.deepEqual(advanceQueue(['a'], 'again'), ['a']);
  });

  it('puts a card rated again last when exactly three cards remain', () => {
    assert.deepEqual(advanceQueue(['a', 'b', 'c', 'd'], 'again'), ['b', 'c', 'd', 'a']);
  });

  it('returns an empty queue for an empty queue', () => {
    assert.deepEqual(advanceQueue([], 'again'), []);
    assert.deepEqual(advanceQueue([], 'good'), []);
  });

  it('does not change the queue it was given', () => {
    const copy = [...queue];
    advanceQueue(queue, 'again');
    assert.deepEqual(queue, copy);
  });
});

describe('buildPracticeQueue', () => {
  it('lists every card once, shuffled', () => {
    const queue = buildPracticeQueue(cards, rng());
    assert.deepEqual([...queue].sort(), cards.map((card) => card.id).sort());
    assert.notDeepEqual(
      queue,
      cards.map((card) => card.id),
    );
  });

  it('gives the same order for the same seed', () => {
    assert.deepEqual(buildPracticeQueue(cards, rng(5)), buildPracticeQueue(cards, rng(5)));
  });
});

describe('deckStats', () => {
  it('counts total, due, new and suspended cards', () => {
    const states = new Map([
      ['c_paris', makeState({ cardId: 'c_paris', lastReviewed: FIXED_NOW, due: FIXED_NOW })],
      ['c_berlin', makeState({ cardId: 'c_berlin', lastReviewed: FIXED_NOW, due: CUTOFF + 1 })],
      ['c_madrid', makeState({ cardId: 'c_madrid', lastReviewed: null })],
      [
        'c_rome',
        makeState({ cardId: 'c_rome', lastReviewed: FIXED_NOW, due: FIXED_NOW, suspended: true }),
      ],
      ['c_lisbon', makeState({ cardId: 'c_lisbon', lastReviewed: null, suspended: true })],
    ]);
    assert.deepEqual(deckStats(cards, states, CUTOFF), {
      total: 6,
      due: 1,
      new: 2,
      suspended: 2,
    });
  });

  it('counts nothing for an empty deck', () => {
    assert.deepEqual(deckStats([], new Map(), CUTOFF), { total: 0, due: 0, new: 0, suspended: 0 });
  });
});
