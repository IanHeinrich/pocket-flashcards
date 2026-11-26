// @ts-check
import { describeInterval } from '../core/scheduler.js';
import { advanceQueue, buildPracticeQueue, buildReviewQueue, isNew } from '../core/session.js';
import { orderCards } from './deck-service.js';

/** @typedef {import('./clock.js').Clock} Clock */
/** @typedef {import('./storage/storage.js').Storage} Storage */
/** @typedef {import('../core/types.js').Card} Card */
/** @typedef {import('../core/types.js').Deck} Deck */
/** @typedef {import('../core/types.js').PracticeSession} PracticeSession */
/** @typedef {import('../core/types.js').Rating} Rating */
/** @typedef {import('../core/types.js').ReviewSession} ReviewSession */
/** @typedef {import('../core/types.js').ReviewState} ReviewState */
/** @typedef {import('../core/types.js').Scheduler} Scheduler */

export class StudyService {
  /** @type {Storage} */
  #storage;
  /** @type {Scheduler} */
  #scheduler;
  /** @type {Clock} */
  #clock;

  /**
   * @param {Storage} storage
   * @param {Scheduler} scheduler
   * @param {Clock} clock
   */
  constructor(storage, scheduler, clock) {
    this.#storage = storage;
    this.#scheduler = scheduler;
    this.#clock = clock;
  }

  /**
   * Starts a review of the due cards and today's new cards.
   * @param {readonly string[] | null} deckIds Null for every deck.
   * @returns {Promise<ReviewSession>}
   */
  async startReview(deckIds) {
    const now = this.#clock.now();
    const [cards, allStates, settings, log] = await Promise.all([
      this.#loadCards(deckIds),
      this.#storage.getStates(),
      this.#storage.getSettings(),
      this.#storage.getReviewLog(this.#clock.startOfDay(now)),
    ]);
    const cardIds = new Set(cards.map((card) => card.id));
    const states = new Map(
      allStates.filter((state) => cardIds.has(state.cardId)).map((state) => [state.cardId, state]),
    );
    const newToday = log.filter((entry) => entry.wasNew).length;
    return {
      queue: buildReviewQueue({
        cards,
        states,
        cutoff: this.#clock.endOfDay(now),
        newLimit: Math.max(0, settings.newPerDay - newToday),
      }),
      cards: new Map(cards.map((card) => [card.id, card])),
      states,
      reviewed: 0,
      tally: { again: 0, hard: 0, good: 0, easy: 0 },
    };
  }

  /**
   * When the next card becomes due after today: the earliest due time, after the end of
   * today, of the reviewed cards that are not suspended. Null when there is none.
   * @param {readonly string[] | null} deckIds Null for every deck.
   * @returns {Promise<number | null>}
   */
  async nextDue(deckIds) {
    const cutoff = this.#clock.endOfDay(this.#clock.now());
    const [cards, states] = await Promise.all([
      this.#loadCards(deckIds),
      this.#storage.getStates(),
    ]);
    const cardIds = new Set(cards.map((card) => card.id));
    /** @type {number | null} */
    let next = null;
    for (const state of states) {
      if (!cardIds.has(state.cardId) || state.suspended || isNew(state)) continue;
      if (state.due > cutoff && (next === null || state.due < next)) next = state.due;
    }
    return next;
  }

  /**
   * Rates the current card, saves its next state and a log entry, and moves on.
   * @param {ReviewSession} session
   * @param {Rating} rating
   * @returns {Promise<ReviewSession>}
   */
  async rate(session, rating) {
    const id = session.queue[0];
    if (id === undefined) throw new Error('This review is finished, so there is no card to rate.');
    const now = this.#clock.now();
    const stored = session.states.get(id);
    const next = this.#scheduler.review(
      stored ?? this.#scheduler.initialState(id, now),
      rating,
      now,
    );
    await this.#storage.putState(next);
    await this.#storage.addReviewLog({ cardId: id, rating, at: now, wasNew: isNew(stored) });
    const states = new Map(session.states);
    states.set(id, next);
    return {
      ...session,
      queue: advanceQueue(session.queue, rating),
      states,
      reviewed: session.reviewed + 1,
      tally: { ...session.tally, [rating]: session.tally[rating] + 1 },
    };
  }

  /**
   * When the current card would next be due for each rating, such as "10m" or "3d".
   * Empty when the review is finished.
   * @param {ReviewSession} session
   * @returns {Record<Rating, string>}
   */
  intervals(session) {
    const id = session.queue[0];
    if (id === undefined) return /** @type {Record<Rating, string>} */ ({});
    const now = this.#clock.now();
    const state = session.states.get(id) ?? this.#scheduler.initialState(id, now);
    const waits = this.#scheduler.preview(state, now);
    return {
      again: describeInterval(waits.again),
      hard: describeInterval(waits.hard),
      good: describeInterval(waits.good),
      easy: describeInterval(waits.easy),
    };
  }

  /**
   * Starts a practice run over every card of the chosen decks, shuffled.
   * @param {{ deckIds: readonly string[] | null, tag?: string }} selection
   *   `deckIds` null for every deck; `tag` keeps only decks with that tag.
   * @param {() => number} random
   * @returns {Promise<PracticeSession>}
   */
  async startPractice({ deckIds, tag }, random) {
    const decks = (await this.#storage.getDecks()).filter(
      (deck) =>
        (deckIds === null || deckIds.includes(deck.id)) &&
        (tag === undefined || deck.tags.includes(tag)),
    );
    const cards = orderCards(await this.#storage.getCards(), decks);
    return practiceSession(cards, random);
  }

  /**
   * Records an answer to the current practice card and moves on.
   * @param {PracticeSession} session
   * @param {boolean} correct
   * @returns {PracticeSession}
   */
  answerPractice(session, correct) {
    const [id, ...queue] = session.queue;
    if (id === undefined) return session;
    return {
      ...session,
      queue,
      missed: correct ? session.missed : [...session.missed, id],
      correct: correct ? session.correct + 1 : session.correct,
    };
  }

  /**
   * A new practice run of the cards missed in this one, shuffled.
   * @param {PracticeSession} session
   * @param {() => number} random
   * @returns {PracticeSession}
   */
  retryMissed(session, random) {
    const cards = session.missed.flatMap((id) => session.cards.get(id) ?? []);
    return practiceSession(cards, random);
  }

  /**
   * Suspends a card, or brings it back. A card with no progress keeps none.
   * @param {string} cardId
   * @param {boolean} suspended
   * @returns {Promise<void>}
   */
  async setSuspended(cardId, suspended) {
    const states = await this.#storage.getStates();
    const state =
      states.find((item) => item.cardId === cardId) ??
      this.#scheduler.initialState(cardId, this.#clock.now());
    await this.#storage.putState({ ...state, suspended });
  }

  /**
   * Forgets a card's progress, so it is new again.
   * @param {string} cardId
   * @returns {Promise<void>}
   */
  resetCard(cardId) {
    return this.#storage.deleteStates([cardId]);
  }

  /**
   * The cards of the given decks, or of every deck, in deck order.
   * @param {readonly string[] | null} deckIds
   * @returns {Promise<Card[]>}
   */
  async #loadCards(deckIds) {
    const decks = await this.#storage.getDecks();
    const chosen = deckIds === null ? decks : decks.filter((deck) => deckIds.includes(deck.id));
    return orderCards(await this.#storage.getCards(), chosen);
  }
}

/**
 * @param {readonly Card[]} cards
 * @param {() => number} random
 * @returns {PracticeSession}
 */
function practiceSession(cards, random) {
  return {
    queue: buildPracticeQueue(cards, random),
    cards: new Map(cards.map((card) => [card.id, card])),
    missed: [],
    correct: 0,
  };
}
