// @ts-check
import { DEFAULT_SETTINGS } from './storage.js';

/** @typedef {import('./storage.js').Storage} Storage */
/** @typedef {import('./storage.js').StorageSnapshot} StorageSnapshot */
/** @typedef {import('./storage.js').ImportWrites} ImportWrites */
/** @typedef {import('../../core/types.js').Asset} Asset */
/** @typedef {import('../../core/types.js').Card} Card */
/** @typedef {import('../../core/types.js').Deck} Deck */
/** @typedef {import('../../core/types.js').ReviewLogEntry} ReviewLogEntry */
/** @typedef {import('../../core/types.js').ReviewState} ReviewState */
/** @typedef {import('../../core/types.js').Settings} Settings */

/**
 * The storage port kept in Maps, for tests. Objects are copied on the way in and out;
 * Blobs are immutable, so they are shared.
 * @implements {Storage}
 */
export class MemoryStorage {
  /** @type {Map<string, Deck>} */
  #decks = new Map();
  /** @type {Map<string, Card>} */
  #cards = new Map();
  /** @type {Map<string, ReviewState>} */
  #states = new Map();
  /** @type {Map<string, Asset>} */
  #assets = new Map();
  /** @type {ReviewLogEntry[]} */
  #reviewLog = [];
  /** @type {Partial<Settings>} */
  #settings = {};

  /** @returns {Promise<Deck[]>} */
  async getDecks() {
    return [...this.#decks.values()].map(copy);
  }

  /**
   * @param {string} id
   * @returns {Promise<Deck | null>}
   */
  async getDeck(id) {
    const deck = this.#decks.get(id);
    return deck ? copy(deck) : null;
  }

  /** @param {Deck} deck */
  async putDeck(deck) {
    this.#decks.set(deck.id, copy(deck));
  }

  /** @param {string} id */
  async deleteDeck(id) {
    const cardIds = [...this.#cards.values()]
      .filter((card) => card.deckId === id)
      .map((card) => card.id);
    await this.deleteCards(cardIds);
    for (const asset of [...this.#assets.values()]) {
      if (asset.deckId === id) this.#assets.delete(asset.id);
    }
    this.#decks.delete(id);
  }

  /**
   * @param {string} [deckId]
   * @returns {Promise<Card[]>}
   */
  async getCards(deckId) {
    return [...this.#cards.values()]
      .filter((card) => deckId === undefined || card.deckId === deckId)
      .map(copy);
  }

  /** @param {readonly Card[]} cards */
  async putCards(cards) {
    for (const card of cards) this.#cards.set(card.id, copy(card));
  }

  /** @param {readonly string[]} ids */
  async deleteCards(ids) {
    for (const id of ids) {
      this.#cards.delete(id);
      this.#states.delete(id);
    }
  }

  /** @returns {Promise<ReviewState[]>} */
  async getStates() {
    return [...this.#states.values()].map(copy);
  }

  /** @param {ReviewState} state */
  async putState(state) {
    this.#states.set(state.cardId, copy(state));
  }

  /** @param {readonly ReviewState[]} states */
  async putStates(states) {
    for (const state of states) this.#states.set(state.cardId, copy(state));
  }

  /** @param {readonly string[]} cardIds */
  async deleteStates(cardIds) {
    for (const id of cardIds) this.#states.delete(id);
  }

  /**
   * @param {string} [deckId]
   * @returns {Promise<Asset[]>}
   */
  async getAssets(deckId) {
    return [...this.#assets.values()]
      .filter((asset) => deckId === undefined || asset.deckId === deckId)
      .map(copy);
  }

  /**
   * @param {string} id
   * @returns {Promise<Asset | null>}
   */
  async getAsset(id) {
    const asset = this.#assets.get(id);
    return asset ? copy(asset) : null;
  }

  /** @param {readonly Asset[]} assets */
  async putAssets(assets) {
    for (const asset of assets) this.#assets.set(asset.id, copy(asset));
  }

  /** @param {readonly string[]} ids */
  async deleteAssets(ids) {
    for (const id of ids) this.#assets.delete(id);
  }

  /**
   * @param {number} [since]
   * @returns {Promise<ReviewLogEntry[]>}
   */
  async getReviewLog(since = -Infinity) {
    return this.#reviewLog
      .filter((entry) => entry.at >= since)
      .sort((a, b) => a.at - b.at)
      .map(copy);
  }

  /** @param {ReviewLogEntry} entry */
  async addReviewLog(entry) {
    this.#reviewLog.push(copy(entry));
  }

  /** @returns {Promise<Settings>} */
  async getSettings() {
    return { ...DEFAULT_SETTINGS, ...this.#settings };
  }

  /** @param {Settings} settings */
  async putSettings(settings) {
    this.#settings = copy(settings);
  }

  async clear() {
    this.#decks.clear();
    this.#cards.clear();
    this.#states.clear();
    this.#assets.clear();
    this.#reviewLog = [];
    this.#settings = {};
  }

  /** @param {StorageSnapshot} snapshot */
  async replaceAll({ decks, cards, states, assets, reviewLog, settings }) {
    const next = {
      decks: keyed(decks, (deck) => deck.id),
      cards: keyed(cards, (card) => card.id),
      states: keyed(states, (state) => state.cardId),
      assets: keyed(assets, (asset) => asset.id),
    };
    this.#decks = next.decks;
    this.#cards = next.cards;
    this.#states = next.states;
    this.#assets = next.assets;
    this.#reviewLog = reviewLog.map(copy);
    this.#settings = copy(settings);
  }

  /** @param {ImportWrites} writes */
  async applyImport({ deck, putCards, deleteCardIds, putAssets, deleteAssetIds }) {
    const [deckEntry] = keyed([deck], (item) => item.id);
    const cards = new Map(this.#cards);
    const states = new Map(this.#states);
    const assets = new Map(this.#assets);
    for (const id of deleteCardIds) {
      cards.delete(id);
      states.delete(id);
    }
    for (const entry of keyed(putCards, (card) => card.id)) cards.set(...entry);
    for (const id of deleteAssetIds) assets.delete(id);
    for (const entry of keyed(putAssets, (asset) => asset.id)) assets.set(...entry);
    this.#decks.set(...deckEntry);
    this.#cards = cards;
    this.#states = states;
    this.#assets = assets;
  }
}

/**
 * Copies records into a Map by key, refusing a record without a text key, as IndexedDB
 * refuses a record without its key path.
 * @template T
 * @param {readonly T[]} records
 * @param {(record: T) => unknown} keyOf
 * @returns {Map<string, T>}
 */
function keyed(records, keyOf) {
  return new Map(
    records.map((record) => {
      const key = keyOf(record);
      if (typeof key !== 'string') throw new TypeError('A record has no valid key.');
      return [key, copy(record)];
    }),
  );
}

/**
 * Deep-copies plain objects and arrays, sharing Blobs.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function copy(value) {
  if (Array.isArray(value)) return /** @type {T} */ (value.map(copy));
  if (value !== null && typeof value === 'object' && !(value instanceof Blob)) {
    return /** @type {T} */ (
      Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]))
    );
  }
  return value;
}
