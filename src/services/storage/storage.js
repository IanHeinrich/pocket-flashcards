// @ts-check

/** @typedef {import('../../core/types.js').Asset} Asset */
/** @typedef {import('../../core/types.js').Card} Card */
/** @typedef {import('../../core/types.js').Deck} Deck */
/** @typedef {import('../../core/types.js').ReviewLogEntry} ReviewLogEntry */
/** @typedef {import('../../core/types.js').ReviewState} ReviewState */
/** @typedef {import('../../core/types.js').Settings} Settings */

/**
 * Everything stored, as `replaceAll` writes it.
 * @typedef {object} StorageSnapshot
 * @property {readonly Deck[]} decks
 * @property {readonly Card[]} cards
 * @property {readonly ReviewState[]} states
 * @property {readonly Asset[]} assets
 * @property {readonly ReviewLogEntry[]} reviewLog Oldest first.
 * @property {Settings} settings
 */

/**
 * The writes of one deck import, as `applyImport` makes them.
 * @typedef {object} ImportWrites
 * @property {Deck} deck
 * @property {readonly Card[]} putCards
 * @property {readonly string[]} deleteCardIds Their states are deleted too.
 * @property {readonly Asset[]} putAssets
 * @property {readonly string[]} deleteAssetIds
 */

/**
 * The storage port. Services talk to storage only through these methods, so the
 * IndexedDB adapter and the in-memory adapter are interchangeable. Every method
 * returns copies: changing a returned object never changes what is stored.
 * @typedef {object} Storage
 * @property {() => Promise<Deck[]>} getDecks
 * @property {(id: string) => Promise<Deck | null>} getDeck
 * @property {(deck: Deck) => Promise<void>} putDeck
 * @property {(id: string) => Promise<void>} deleteDeck
 *   Also deletes the deck's cards, their states and the deck's assets.
 * @property {(deckId?: string) => Promise<Card[]>} getCards Every card, or one deck's.
 * @property {(cards: readonly Card[]) => Promise<void>} putCards
 * @property {(ids: readonly string[]) => Promise<void>} deleteCards Also deletes their states.
 * @property {() => Promise<ReviewState[]>} getStates
 * @property {(state: ReviewState) => Promise<void>} putState
 * @property {(states: readonly ReviewState[]) => Promise<void>} putStates
 * @property {(cardIds: readonly string[]) => Promise<void>} deleteStates
 * @property {(deckId?: string) => Promise<Asset[]>} getAssets Every asset, or one deck's.
 * @property {(id: string) => Promise<Asset | null>} getAsset
 * @property {(assets: readonly Asset[]) => Promise<void>} putAssets
 * @property {(ids: readonly string[]) => Promise<void>} deleteAssets
 * @property {(since?: number) => Promise<ReviewLogEntry[]>} getReviewLog
 *   Entries at or after `since` (all when omitted), oldest first.
 * @property {(entry: ReviewLogEntry) => Promise<void>} addReviewLog
 * @property {() => Promise<Settings>} getSettings The stored settings merged over `DEFAULT_SETTINGS`.
 * @property {(settings: Settings) => Promise<void>} putSettings
 * @property {() => Promise<void>} clear Deletes everything, settings included.
 * @property {(snapshot: StorageSnapshot) => Promise<void>} replaceAll
 *   Deletes everything and writes the snapshot, all at once: if any write fails, nothing
 *   changes.
 * @property {(writes: ImportWrites) => Promise<void>} applyImport
 *   Puts the deck, deletes and puts its cards, then deletes and puts its assets, all at
 *   once: if any write fails, nothing changes.
 */

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  newPerDay: 20,
  theme: 'system',
  allowRemoteImages: false,
});

/** The IndexedDB schema version. Each version has a migration in `indexeddb-storage.js`. */
export const SCHEMA_VERSION = 1;
