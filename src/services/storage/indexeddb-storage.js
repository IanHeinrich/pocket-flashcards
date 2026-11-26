// @ts-check
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from './storage.js';

/** @typedef {import('./storage.js').Storage} Storage */
/** @typedef {import('./storage.js').StorageSnapshot} StorageSnapshot */
/** @typedef {import('./storage.js').ImportWrites} ImportWrites */
/** @typedef {import('../../core/types.js').Asset} Asset */
/** @typedef {import('../../core/types.js').Card} Card */
/** @typedef {import('../../core/types.js').Deck} Deck */
/** @typedef {import('../../core/types.js').ReviewLogEntry} ReviewLogEntry */
/** @typedef {import('../../core/types.js').ReviewState} ReviewState */
/** @typedef {import('../../core/types.js').Settings} Settings */

/** @typedef {'decks' | 'cards' | 'states' | 'assets' | 'reviewLog' | 'settings'} StoreName */

/** @type {StoreName[]} */
const STORES = ['decks', 'cards', 'states', 'assets', 'reviewLog', 'settings'];
const SETTINGS_KEY = 'settings';
const UPDATED_ELSEWHERE =
  'Pocket Flashcards was updated in another tab. Reload this page to continue.';

/**
 * Schema migrations, in order: `MIGRATIONS[v]` upgrades a database from version `v`
 * to `v + 1`. A new schema version is a new entry here.
 * @type {((db: IDBDatabase, transaction: IDBTransaction) => void)[]}
 */
const MIGRATIONS = [
  (db) => {
    db.createObjectStore('decks', { keyPath: 'id' });
    db.createObjectStore('cards', { keyPath: 'id' }).createIndex('deckId', 'deckId');
    db.createObjectStore('states', { keyPath: 'cardId' });
    db.createObjectStore('assets', { keyPath: 'id' }).createIndex('deckId', 'deckId');
    db.createObjectStore('reviewLog', { autoIncrement: true }).createIndex('at', 'at');
    db.createObjectStore('settings');
  },
];

/**
 * The storage port on IndexedDB. IndexedDB stores structured clones, so every value
 * read or written is already a copy.
 * @implements {Storage}
 */
export class IndexedDbStorage {
  /** @type {IDBDatabase} */
  #db;
  /** True once another tab upgraded the database and this connection was closed. */
  #closed = false;

  /**
   * @param {IDBDatabase} db An open database; use `IndexedDbStorage.open`.
   * @param {{ onVersionChange?: () => void }} [options]
   *   `onVersionChange` is called when another tab upgrades the database. The connection
   *   is closed by then, and every later call rejects.
   */
  constructor(db, { onVersionChange } = {}) {
    this.#db = db;
    db.onversionchange = () => {
      this.#closed = true;
      db.close();
      onVersionChange?.();
    };
  }

  /**
   * Opens the database, creating or upgrading it to `SCHEMA_VERSION`.
   * @param {string} [name]
   * @param {{ onVersionChange?: () => void }} [options]
   *   `onVersionChange` is called when another tab upgrades the database.
   * @returns {Promise<IndexedDbStorage>}
   */
  static open(name = 'pocket-flashcards', { onVersionChange } = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const request = indexedDB.open(name, SCHEMA_VERSION);
      request.onupgradeneeded = (event) => {
        const transaction = /** @type {IDBTransaction} */ (request.transaction);
        for (let version = event.oldVersion; version < SCHEMA_VERSION; version++) {
          MIGRATIONS[version](request.result, transaction);
        }
      };
      request.onblocked = () => {
        settled = true;
        reject(
          new Error(
            'Pocket Flashcards is open in another tab with an older version. Close that tab and reload this one.',
          ),
        );
      };
      request.onsuccess = () => {
        if (settled) request.result.close();
        else resolve(new IndexedDbStorage(request.result, { onVersionChange }));
      };
      request.onerror = () => reject(request.error);
    });
  }

  /** @returns {Promise<Deck[]>} */
  getDecks() {
    return this.#read('decks', (store) => store.getAll());
  }

  /**
   * @param {string} id
   * @returns {Promise<Deck | null>}
   */
  async getDeck(id) {
    return (await this.#read('decks', (store) => store.get(id))) ?? null;
  }

  /** @param {Deck} deck */
  putDeck(deck) {
    return this.#write(['decks'], (tx) => tx.objectStore('decks').put(deck));
  }

  /** @param {string} id */
  deleteDeck(id) {
    return this.#write(['decks', 'cards', 'states', 'assets'], (tx) => {
      const cards = tx.objectStore('cards');
      const states = tx.objectStore('states');
      const assets = tx.objectStore('assets');
      const cardIds = cards.index('deckId').getAllKeys(id);
      cardIds.onsuccess = () => {
        for (const cardId of cardIds.result) {
          cards.delete(cardId);
          states.delete(cardId);
        }
      };
      const assetIds = assets.index('deckId').getAllKeys(id);
      assetIds.onsuccess = () => {
        for (const assetId of assetIds.result) assets.delete(assetId);
      };
      tx.objectStore('decks').delete(id);
    });
  }

  /**
   * @param {string} [deckId]
   * @returns {Promise<Card[]>}
   */
  getCards(deckId) {
    return this.#read('cards', (store) =>
      deckId === undefined ? store.getAll() : store.index('deckId').getAll(deckId),
    );
  }

  /** @param {readonly Card[]} cards */
  putCards(cards) {
    return this.#write(['cards'], (tx) => putAll(tx.objectStore('cards'), cards));
  }

  /** @param {readonly string[]} ids */
  deleteCards(ids) {
    return this.#write(['cards', 'states'], (tx) => {
      const cards = tx.objectStore('cards');
      const states = tx.objectStore('states');
      for (const id of ids) {
        cards.delete(id);
        states.delete(id);
      }
    });
  }

  /** @returns {Promise<ReviewState[]>} */
  getStates() {
    return this.#read('states', (store) => store.getAll());
  }

  /** @param {ReviewState} state */
  putState(state) {
    return this.putStates([state]);
  }

  /** @param {readonly ReviewState[]} states */
  putStates(states) {
    return this.#write(['states'], (tx) => putAll(tx.objectStore('states'), states));
  }

  /** @param {readonly string[]} cardIds */
  deleteStates(cardIds) {
    return this.#write(['states'], (tx) => {
      const store = tx.objectStore('states');
      for (const id of cardIds) store.delete(id);
    });
  }

  /**
   * @param {string} [deckId]
   * @returns {Promise<Asset[]>}
   */
  getAssets(deckId) {
    return this.#read('assets', (store) =>
      deckId === undefined ? store.getAll() : store.index('deckId').getAll(deckId),
    );
  }

  /**
   * @param {string} id
   * @returns {Promise<Asset | null>}
   */
  async getAsset(id) {
    return (await this.#read('assets', (store) => store.get(id))) ?? null;
  }

  /** @param {readonly Asset[]} assets */
  putAssets(assets) {
    return this.#write(['assets'], (tx) => putAll(tx.objectStore('assets'), assets));
  }

  /** @param {readonly string[]} ids */
  deleteAssets(ids) {
    return this.#write(['assets'], (tx) => {
      const store = tx.objectStore('assets');
      for (const id of ids) store.delete(id);
    });
  }

  /**
   * @param {number} [since]
   * @returns {Promise<ReviewLogEntry[]>}
   */
  getReviewLog(since) {
    return this.#read('reviewLog', (store) =>
      store.index('at').getAll(since === undefined ? undefined : IDBKeyRange.lowerBound(since)),
    );
  }

  /** @param {ReviewLogEntry} entry */
  addReviewLog(entry) {
    return this.#write(['reviewLog'], (tx) => tx.objectStore('reviewLog').add(entry));
  }

  /** @returns {Promise<Settings>} */
  async getSettings() {
    const stored = await this.#read('settings', (store) => store.get(SETTINGS_KEY));
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  /** @param {Settings} settings */
  putSettings(settings) {
    return this.#write(['settings'], (tx) =>
      tx.objectStore('settings').put(settings, SETTINGS_KEY),
    );
  }

  clear() {
    return this.#write(STORES, (tx) => {
      for (const name of STORES) tx.objectStore(name).clear();
    });
  }

  /** @param {StorageSnapshot} snapshot */
  replaceAll({ decks, cards, states, assets, reviewLog, settings }) {
    return this.#write(STORES, (tx) => {
      for (const name of STORES) tx.objectStore(name).clear();
      putAll(tx.objectStore('decks'), decks);
      putAll(tx.objectStore('cards'), cards);
      putAll(tx.objectStore('states'), states);
      putAll(tx.objectStore('assets'), assets);
      const log = tx.objectStore('reviewLog');
      for (const entry of reviewLog) log.add(entry);
      tx.objectStore('settings').put(settings, SETTINGS_KEY);
    });
  }

  /** @param {ImportWrites} writes */
  applyImport({ deck, putCards, deleteCardIds, putAssets, deleteAssetIds }) {
    return this.#write(['decks', 'cards', 'states', 'assets'], (tx) => {
      const cards = tx.objectStore('cards');
      const states = tx.objectStore('states');
      const assets = tx.objectStore('assets');
      tx.objectStore('decks').put(deck);
      for (const id of deleteCardIds) {
        cards.delete(id);
        states.delete(id);
      }
      putAll(cards, putCards);
      for (const id of deleteAssetIds) assets.delete(id);
      putAll(assets, putAssets);
    });
  }

  /**
   * Runs one read request in a read-only transaction.
   * @param {StoreName} name
   * @param {(store: IDBObjectStore) => IDBRequest} makeRequest
   * @returns {Promise<any>}
   */
  async #read(name, makeRequest) {
    if (this.#closed) throw new Error(UPDATED_ELSEWHERE);
    const store = this.#db.transaction(name, 'readonly').objectStore(name);
    return requestResult(makeRequest(store));
  }

  /**
   * Runs `work` in one read-write transaction and resolves when it commits.
   * @param {StoreName[]} names
   * @param {(tx: IDBTransaction) => unknown} work Issues requests; it must not await.
   * @returns {Promise<void>}
   */
  async #write(names, work) {
    if (this.#closed) throw new Error(UPDATED_ELSEWHERE);
    const tx = this.#db.transaction(names, 'readwrite');
    const done = transactionDone(tx);
    try {
      work(tx);
    } catch (error) {
      done.catch(() => {});
      tx.abort();
      throw error;
    }
    return done;
  }
}

/**
 * @param {IDBObjectStore} store
 * @param {readonly unknown[]} records
 */
function putAll(store, records) {
  for (const record of records) store.put(record);
}

/**
 * @param {IDBRequest} request
 * @returns {Promise<any>}
 */
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('The database change was cancelled.'));
  });
}
