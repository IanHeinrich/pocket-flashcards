// @ts-check
import { seededRandom } from '../src/core/random.js';

/** @typedef {import('../src/core/types.js').Card} Card */
/** @typedef {import('../src/core/types.js').Deck} Deck */
/** @typedef {import('../src/core/types.js').ReviewState} ReviewState */

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** A fixed "now" for every test: 15 January 2026, 09:00 UTC. */
export const FIXED_NOW = Date.UTC(2026, 0, 15, 9, 0);

/**
 * @param {number} [seed]
 * @returns {() => number}
 */
export function rng(seed = 1) {
  return seededRandom(seed);
}

/**
 * @param {Partial<Card>} [overrides]
 * @returns {Card}
 */
export function makeCard(overrides = {}) {
  return {
    id: 'c_france',
    deckId: 'd_capitals',
    front: 'What is the capital of France?',
    back: 'Paris',
    position: 0,
    ...overrides,
  };
}

/**
 * @param {Partial<ReviewState>} [overrides]
 * @returns {ReviewState}
 */
export function makeState(overrides = {}) {
  return {
    cardId: 'c_france',
    due: FIXED_NOW,
    interval: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    lastReviewed: null,
    suspended: false,
    ...overrides,
  };
}

/**
 * @param {Partial<Deck>} [overrides]
 * @returns {Deck}
 */
export function makeDeck(overrides = {}) {
  return {
    id: 'd_capitals',
    name: 'Geography / Capitals',
    tags: [],
    importedAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  };
}

/** @typedef {import('../src/services/clock.js').Clock} Clock */
/** @typedef {import('../src/core/types.js').ImportSource} ImportSource */

/**
 * A clock stopped at `now`, with days in UTC.
 * @param {number} [now]
 * @returns {Clock}
 */
export function fixedClock(now = FIXED_NOW) {
  const startOfDay = (/** @type {number} */ time) => time - (time % DAY);
  return {
    now: () => now,
    startOfDay,
    endOfDay: (time) => startOfDay(time) + DAY - 1,
  };
}

export const CAPITALS_DECK = `---
deck: Geography / Capitals
tags: [geography]
---

## What is the capital of France?

Paris

## What is the capital of Spain?

Madrid

## What is the capital of Italy?

Rome
`;

export const CHEMISTRY_DECK = `---
deck: Science / Chemistry
tags: [science, chemistry]
---

## What is the chemical symbol for sodium?

Na

## What is the chemical symbol for iron?

Fe
`;

/**
 * @param {string} name
 * @param {string} text
 * @returns {ImportSource}
 */
export function deckSource(name, text) {
  return { kind: 'deck', name, text };
}

/**
 * @param {string} name
 * @param {string} [content]
 * @param {string} [type]
 * @returns {ImportSource}
 */
export function imageSource(name, content = name, type = 'image/png') {
  return {
    kind: 'image',
    name,
    type,
    data: new Blob([content], { type }),
  };
}

/**
 * Previews and commits deck texts, as the import screen does.
 * @param {import('../src/services/deck-service.js').DeckService} decks
 * @param {...ImportSource} sources
 */
export async function importDecks(decks, ...sources) {
  for (const preview of await decks.previewImport(sources)) await decks.commitImport(preview);
}
