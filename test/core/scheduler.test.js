// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeInterval, sm2 } from '../../src/core/scheduler.js';
import { DAY, FIXED_NOW, HOUR, MINUTE, makeState } from '../helpers.js';

const LATER = FIXED_NOW + 5 * DAY;

describe('sm2.initialState', () => {
  it('starts a card as new and due now', () => {
    assert.deepEqual(sm2.initialState('c_france', FIXED_NOW), {
      cardId: 'c_france',
      due: FIXED_NOW,
      interval: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      lastReviewed: null,
      suspended: false,
    });
  });

  it('has the id sm2', () => {
    assert.equal(sm2.id, 'sm2');
  });
});

describe('sm2.review: again', () => {
  it('relearns in 10 minutes with interval 0 and reps reset', () => {
    const next = sm2.review(makeState({ reps: 3, interval: 10 }), 'again', LATER);
    assert.equal(next.interval, 0);
    assert.equal(next.due, LATER + 10 * MINUTE);
    assert.equal(next.reps, 0);
  });

  it('lowers ease by 0.2', () => {
    assert.equal(sm2.review(makeState({ ease: 2.5 }), 'again', LATER).ease, 2.3);
  });

  it('never lowers ease below 1.3', () => {
    assert.equal(sm2.review(makeState({ ease: 1.4 }), 'again', LATER).ease, 1.3);
    assert.equal(sm2.review(makeState({ ease: 1.3 }), 'again', LATER).ease, 1.3);
  });

  it('counts a lapse when a learned card is forgotten', () => {
    assert.equal(sm2.review(makeState({ reps: 2, lapses: 1 }), 'again', LATER).lapses, 2);
  });

  it('does not count a lapse for a card that was not learned yet', () => {
    assert.equal(sm2.review(makeState({ reps: 0, lapses: 1 }), 'again', LATER).lapses, 1);
  });
});

describe('sm2.review: hard', () => {
  it('schedules a first review in 1 day', () => {
    const next = sm2.review(makeState({ reps: 0 }), 'hard', LATER);
    assert.equal(next.interval, 1);
    assert.equal(next.due, LATER + DAY);
  });

  it('multiplies the interval by 1.2 when that grows it by more than a day', () => {
    assert.equal(sm2.review(makeState({ reps: 2, interval: 10 }), 'hard', LATER).interval, 12);
  });

  it('grows the interval by at least one day', () => {
    assert.equal(sm2.review(makeState({ reps: 2, interval: 3 }), 'hard', LATER).interval, 4);
  });

  it('lowers ease by 0.15, down to 1.3', () => {
    assert.equal(sm2.review(makeState({ ease: 2.5 }), 'hard', LATER).ease, 2.35);
    assert.equal(sm2.review(makeState({ ease: 1.35 }), 'hard', LATER).ease, 1.3);
  });

  it('adds a rep', () => {
    assert.equal(sm2.review(makeState({ reps: 2, interval: 3 }), 'hard', LATER).reps, 3);
  });
});

describe('sm2.review: good', () => {
  it('schedules a first review in 1 day', () => {
    assert.equal(sm2.review(makeState({ reps: 0 }), 'good', LATER).interval, 1);
  });

  it('schedules a second review in 3 days', () => {
    const next = sm2.review(makeState({ reps: 1, interval: 1 }), 'good', LATER);
    assert.equal(next.interval, 3);
    assert.equal(next.due, LATER + 3 * DAY);
  });

  it('multiplies the interval by ease after that', () => {
    assert.equal(
      sm2.review(makeState({ reps: 2, interval: 3, ease: 2.5 }), 'good', LATER).interval,
      8,
    );
  });

  it('grows the interval by at least one day', () => {
    assert.equal(
      sm2.review(makeState({ reps: 2, interval: 1, ease: 1.3 }), 'good', LATER).interval,
      2,
    );
  });

  it('keeps ease and adds a rep', () => {
    const next = sm2.review(makeState({ reps: 2, interval: 3, ease: 2.2 }), 'good', LATER);
    assert.equal(next.ease, 2.2);
    assert.equal(next.reps, 3);
  });
});

describe('sm2.review: easy', () => {
  it('schedules a first review in 4 days', () => {
    assert.equal(sm2.review(makeState({ reps: 0 }), 'easy', LATER).interval, 4);
  });

  it('multiplies the interval by ease and 1.3 after that', () => {
    assert.equal(
      sm2.review(makeState({ reps: 1, interval: 4, ease: 2.5 }), 'easy', LATER).interval,
      13,
    );
  });

  it('grows the interval by at least one day', () => {
    assert.equal(
      sm2.review(makeState({ reps: 1, interval: 1, ease: 1.3 }), 'easy', LATER).interval,
      2,
    );
  });

  it('raises ease by 0.15 and adds a rep', () => {
    const next = sm2.review(makeState({ reps: 1, interval: 4, ease: 2.5 }), 'easy', LATER);
    assert.equal(next.ease, 2.65);
    assert.equal(next.reps, 2);
  });
});

describe('sm2.review: every rating', () => {
  it('records when the card was reviewed', () => {
    for (const rating of /** @type {const} */ (['again', 'hard', 'good', 'easy'])) {
      assert.equal(sm2.review(makeState(), rating, LATER).lastReviewed, LATER);
    }
  });

  it('keeps the card suspended or not, as it was', () => {
    assert.equal(sm2.review(makeState({ suspended: true }), 'good', LATER).suspended, true);
    assert.equal(sm2.review(makeState({ suspended: false }), 'again', LATER).suspended, false);
  });

  it('keeps lapses on a successful review', () => {
    assert.equal(sm2.review(makeState({ lapses: 2 }), 'good', LATER).lapses, 2);
  });

  it('returns a new state and leaves the old one as it was', () => {
    const state = makeState({ reps: 2, interval: 3 });
    const copy = { ...state };
    const next = sm2.review(state, 'good', LATER);
    assert.notEqual(next, state);
    assert.deepEqual(state, copy);
  });

  it('does not let ease drift after many small steps', () => {
    let state = makeState({ ease: 2.5 });
    for (let i = 0; i < 4; i++) state = sm2.review(state, 'hard', LATER);
    assert.equal(state.ease, 1.9);
  });
});

describe('sm2.preview', () => {
  it('gives the wait until due for each rating', () => {
    const state = makeState({ reps: 2, interval: 10, ease: 2.5 });
    assert.deepEqual(sm2.preview(state, LATER), {
      again: 10 * MINUTE,
      hard: 12 * DAY,
      good: 25 * DAY,
      easy: 33 * DAY,
    });
  });

  it('gives the first-review waits for a new card', () => {
    assert.deepEqual(sm2.preview(sm2.initialState('c_france', FIXED_NOW), FIXED_NOW), {
      again: 10 * MINUTE,
      hard: DAY,
      good: DAY,
      easy: 4 * DAY,
    });
  });
});

describe('describeInterval', () => {
  it('shows minutes under an hour, at least 1', () => {
    assert.equal(describeInterval(0), '1m');
    assert.equal(describeInterval(10 * MINUTE), '10m');
    assert.equal(describeInterval(59 * MINUTE), '59m');
  });

  it('shows hours from one hour to under a day', () => {
    assert.equal(describeInterval(HOUR), '1h');
    assert.equal(describeInterval(5 * HOUR + 20 * MINUTE), '5h');
    assert.equal(describeInterval(23 * HOUR), '23h');
  });

  it('shows days from one day to under 30 days', () => {
    assert.equal(describeInterval(DAY), '1d');
    assert.equal(describeInterval(3 * DAY), '3d');
    assert.equal(describeInterval(29 * DAY), '29d');
  });

  it('shows months of 30 days, with one decimal and no trailing .0', () => {
    assert.equal(describeInterval(30 * DAY), '1mo');
    assert.equal(describeInterval(45 * DAY), '1.5mo');
    assert.equal(describeInterval(60 * DAY), '2mo');
    assert.equal(describeInterval(358 * DAY), '11.9mo');
  });

  it('shows years of 365 days, with one decimal and no trailing .0', () => {
    assert.equal(describeInterval(365 * DAY), '1y');
    assert.equal(describeInterval(438 * DAY), '1.2y');
    assert.equal(describeInterval(730 * DAY), '2y');
  });

  it('promotes a value that rounds up to the next unit', () => {
    assert.equal(describeInterval(HOUR - 20_000), '1h');
    assert.equal(describeInterval(DAY - 30_000), '1d');
    assert.equal(describeInterval(23 * HOUR + 40 * MINUTE), '1d');
    assert.equal(describeInterval(30 * DAY - 30_000), '1mo');
    assert.equal(describeInterval(29.6 * DAY), '1mo');
    assert.equal(describeInterval(360 * DAY), '1y');
    assert.equal(describeInterval(364 * DAY), '1y');
  });

  it('keeps a value that rounds down below the next unit', () => {
    assert.equal(describeInterval(HOUR - 40_000), '59m');
    assert.equal(describeInterval(23 * HOUR + 20 * MINUTE), '23h');
    assert.equal(describeInterval(29.4 * DAY), '29d');
  });
});
