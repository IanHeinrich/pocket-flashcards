// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deckId } from '../../src/core/ids.js';
import { sm2 } from '../../src/core/scheduler.js';
import { DeckService } from '../../src/services/deck-service.js';
import { MemoryStorage } from '../../src/services/storage/memory-storage.js';
import { DEFAULT_SETTINGS } from '../../src/services/storage/storage.js';
import { StudyService } from '../../src/services/study-service.js';
import {
  CAPITALS_DECK,
  CHEMISTRY_DECK,
  DAY,
  FIXED_NOW,
  MINUTE,
  deckSource,
  fixedClock,
  importDecks,
  rng,
} from '../helpers.js';

/** @typedef {import('../../src/core/types.js').Card} Card */

const CAPITALS_ID = deckId('Geography / Capitals');
const CHEMISTRY_ID = deckId('Science / Chemistry');

/**
 * Both fixture decks imported, with a study service at `now`.
 * @param {number} [now]
 */
async function setup(now = FIXED_NOW) {
  const storage = new MemoryStorage();
  await importDecks(
    new DeckService(storage, fixedClock()),
    deckSource('capitals.md', CAPITALS_DECK),
    deckSource('chemistry.md', CHEMISTRY_DECK),
  );
  return { storage, study: new StudyService(storage, sm2, fixedClock(now)) };
}

/**
 * @param {{ queue: string[], cards: Map<string, Card> }} session A review or practice session.
 * @returns {string[]} The backs of the queued cards, in order.
 */
function backs(session) {
  return session.queue.map((id) => session.cards.get(id)?.back ?? '?');
}

describe('StudyService.startReview', () => {
  it('queues new cards by deck name, then position', async () => {
    const { study } = await setup();
    const session = await study.startReview(null);
    assert.deepEqual(backs(session), ['Paris', 'Madrid', 'Rome', 'Na', 'Fe']);
    assert.equal(session.reviewed, 0);
    assert.deepEqual(session.tally, { again: 0, hard: 0, good: 0, easy: 0 });
  });

  it('reviews only the chosen decks', async () => {
    const { study } = await setup();
    const session = await study.startReview([CHEMISTRY_ID]);
    assert.deepEqual(backs(session), ['Na', 'Fe']);
    assert.equal(session.cards.size, 2);
  });

  it('puts due cards first and leaves out cards due after today', async () => {
    const { storage, study } = await setup();
    const [paris, madrid] = await storage.getCards(CAPITALS_ID);
    await storage.putStates([
      {
        ...sm2.initialState(paris.id, FIXED_NOW),
        lastReviewed: FIXED_NOW - DAY,
        due: FIXED_NOW + DAY,
      },
      {
        ...sm2.initialState(madrid.id, FIXED_NOW),
        lastReviewed: FIXED_NOW - DAY,
        due: FIXED_NOW + 5 * 60 * MINUTE,
      },
    ]);
    const session = await study.startReview([CAPITALS_ID]);
    assert.deepEqual(backs(session), ['Madrid', 'Rome']);
  });

  it('skips suspended cards', async () => {
    const { storage, study } = await setup();
    const [paris] = await storage.getCards(CAPITALS_ID);
    await study.setSuspended(paris.id, true);
    const session = await study.startReview([CAPITALS_ID]);
    assert.deepEqual(backs(session), ['Madrid', 'Rome']);
  });

  it('limits new cards per day across sessions, counting the review log', async () => {
    const { storage, study } = await setup();
    await storage.putSettings({ ...DEFAULT_SETTINGS, newPerDay: 3 });

    const session = await study.startReview(null);
    assert.equal(session.queue.length, 3);
    await study.rate(await study.rate(session, 'again'), 'good');

    const next = await study.startReview(null);
    assert.deepEqual(backs(next), ['Paris', 'Rome']);

    const tomorrow = new StudyService(storage, sm2, fixedClock(FIXED_NOW + DAY));
    const fresh = (await tomorrow.startReview(null)).queue.filter((id) => !next.states.has(id));
    assert.equal(fresh.length, 3);
  });

  it('never lets the new-card limit go below zero', async () => {
    const { storage, study } = await setup();
    await storage.putSettings({ ...DEFAULT_SETTINGS, newPerDay: 1 });
    await study.rate(await study.startReview(null), 'good');
    await storage.putSettings({ ...DEFAULT_SETTINGS, newPerDay: 0 });
    assert.deepEqual((await study.startReview(null)).queue, []);
  });
});

describe('StudyService.nextDue', () => {
  /**
   * @param {string} cardId
   * @param {number} due
   * @param {Partial<import('../../src/core/types.js').ReviewState>} [overrides]
   */
  const reviewed = (cardId, due, overrides = {}) => ({
    ...sm2.initialState(cardId, FIXED_NOW),
    lastReviewed: FIXED_NOW - DAY,
    due,
    ...overrides,
  });

  it('finds the earliest due time after today among reviewed, unsuspended cards', async () => {
    const { storage, study } = await setup();
    const [paris, madrid, rome] = await storage.getCards(CAPITALS_ID);
    const [sodium, iron] = await storage.getCards(CHEMISTRY_ID);
    await storage.putStates([
      reviewed(paris.id, FIXED_NOW + 5 * 60 * MINUTE),
      reviewed(madrid.id, FIXED_NOW + 3 * DAY),
      reviewed(rome.id, FIXED_NOW + DAY, { suspended: true }),
      { ...sm2.initialState(sodium.id, FIXED_NOW + DAY), due: FIXED_NOW + DAY },
      reviewed(iron.id, FIXED_NOW + 2 * DAY),
    ]);
    assert.equal(await study.nextDue([CAPITALS_ID]), FIXED_NOW + 3 * DAY);
    assert.equal(await study.nextDue(null), FIXED_NOW + 2 * DAY);
  });

  it('is null when no reviewed card is due after today', async () => {
    const { storage, study } = await setup();
    assert.equal(await study.nextDue(null), null);
    const [paris] = await storage.getCards(CAPITALS_ID);
    await storage.putState(reviewed(paris.id, FIXED_NOW - DAY));
    assert.equal(await study.nextDue(null), null);
    assert.equal(await study.nextDue([CHEMISTRY_ID]), null);
  });
});

describe('StudyService.rate', () => {
  it('saves the next state and a log entry, and moves on', async () => {
    const { storage, study } = await setup();
    const session = await study.startReview([CAPITALS_ID]);
    const paris = session.queue[0];
    const next = await study.rate(session, 'good');

    const expected = sm2.review(sm2.initialState(paris, FIXED_NOW), 'good', FIXED_NOW);
    assert.deepEqual(await storage.getStates(), [expected]);
    assert.deepEqual(await storage.getReviewLog(), [
      { cardId: paris, rating: 'good', at: FIXED_NOW, wasNew: true },
    ]);
    assert.deepEqual(backs(next), ['Madrid', 'Rome']);
    assert.deepEqual(next.states.get(paris), expected);
    assert.equal(next.reviewed, 1);
    assert.deepEqual(next.tally, { again: 0, hard: 0, good: 1, easy: 0 });
  });

  it('leaves the session it was given as it was', async () => {
    const { study } = await setup();
    const session = await study.startReview([CAPITALS_ID]);
    await study.rate(session, 'good');
    assert.equal(session.queue.length, 3);
    assert.equal(session.states.size, 0);
    assert.equal(session.reviewed, 0);
  });

  it('brings a card rated again back later in the session, no longer new', async () => {
    const { storage, study } = await setup();
    let session = await study.startReview(null);
    session = await study.rate(session, 'again');
    assert.deepEqual(backs(session), ['Madrid', 'Rome', 'Na', 'Paris', 'Fe']);
    for (let i = 0; i < 3; i++) session = await study.rate(session, 'good');
    session = await study.rate(session, 'good');
    const log = await storage.getReviewLog();
    assert.deepEqual(
      log.map((entry) => [entry.rating, entry.wasNew]),
      [
        ['again', true],
        ['good', true],
        ['good', true],
        ['good', true],
        ['good', false],
      ],
    );
    assert.deepEqual(session.tally, { again: 1, hard: 0, good: 4, easy: 0 });
  });

  it('refuses to rate when the review is finished', async () => {
    const { study } = await setup();
    const session = await study.startReview([]);
    await assert.rejects(study.rate(session, 'good'), /finished/);
  });
});

describe('StudyService.intervals', () => {
  it('describes when the current card would be due for each rating', async () => {
    const { study } = await setup();
    const session = await study.startReview(null);
    assert.deepEqual(study.intervals(session), {
      again: '10m',
      hard: '1d',
      good: '1d',
      easy: '4d',
    });
  });

  it('is empty when the review is finished', async () => {
    const { study } = await setup();
    assert.deepEqual(study.intervals(await study.startReview([])), {});
  });
});

describe('StudyService practice', () => {
  it('shuffles every card of the chosen decks with the random function given', async () => {
    const { study } = await setup();
    const first = await study.startPractice({ deckIds: null }, rng(7));
    const again = await study.startPractice({ deckIds: null }, rng(7));
    assert.deepEqual(first.queue, again.queue);
    assert.equal(first.queue.length, 5);
    assert.deepEqual(first.missed, []);
    assert.equal(first.correct, 0);
    const chemistry = await study.startPractice({ deckIds: [CHEMISTRY_ID] }, rng());
    assert.deepEqual(backs(chemistry).sort(), ['Fe', 'Na']);
  });

  it('keeps only decks with the tag when one is given', async () => {
    const { study } = await setup();
    const session = await study.startPractice({ deckIds: null, tag: 'geography' }, rng());
    assert.deepEqual(backs(session).sort(), ['Madrid', 'Paris', 'Rome']);
  });

  it('includes cards with progress and never changes scheduling', async () => {
    const { storage, study } = await setup();
    const review = await study.startReview([CAPITALS_ID]);
    await study.rate(review, 'easy');
    const before = await storage.getStates();
    const session = await study.startPractice({ deckIds: [CAPITALS_ID] }, rng());
    assert.equal(session.queue.length, 3);
    study.answerPractice(session, false);
    assert.deepEqual(await storage.getStates(), before);
  });

  it('records answers and retries the missed cards, shuffled', async () => {
    const { study } = await setup();
    let session = await study.startPractice({ deckIds: null }, rng(3));
    const [a, b, c] = session.queue;
    session = study.answerPractice(session, true);
    session = study.answerPractice(session, false);
    session = study.answerPractice(session, false);
    session = study.answerPractice(session, true);
    session = study.answerPractice(session, true);
    assert.deepEqual(session.queue, []);
    assert.deepEqual(session.missed, [b, c]);
    assert.equal(session.correct, 3);
    assert.equal(study.answerPractice(session, true), session);

    const retry = study.retryMissed(session, rng(3));
    assert.deepEqual([...retry.queue].sort(), [b, c].sort());
    assert.deepEqual([...retry.cards.keys()].sort(), [b, c].sort());
    assert.deepEqual(retry.missed, []);
    assert.equal(retry.correct, 0);
    assert.ok(!retry.queue.includes(a));
  });
});

describe('StudyService card actions', () => {
  it('suspends a new card without making it reviewed, and brings it back', async () => {
    const { storage, study } = await setup();
    const [paris] = await storage.getCards(CAPITALS_ID);
    await study.setSuspended(paris.id, true);
    assert.deepEqual(await storage.getStates(), [
      { ...sm2.initialState(paris.id, FIXED_NOW), suspended: true },
    ]);
    await study.setSuspended(paris.id, false);
    assert.equal((await study.startReview([CAPITALS_ID])).queue[0], paris.id);
  });

  it('suspends a reviewed card and keeps its progress', async () => {
    const { storage, study } = await setup();
    const review = await study.startReview([CAPITALS_ID]);
    await study.rate(review, 'good');
    const [reviewed] = await storage.getStates();
    await study.setSuspended(reviewed.cardId, true);
    assert.deepEqual(await storage.getStates(), [{ ...reviewed, suspended: true }]);
  });

  it('resets a card so it is new again', async () => {
    const { storage, study } = await setup();
    const review = await study.startReview([CAPITALS_ID]);
    await study.rate(review, 'good');
    await study.resetCard(review.queue[0]);
    assert.deepEqual(await storage.getStates(), []);
  });
});
