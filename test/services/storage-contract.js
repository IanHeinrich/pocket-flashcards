// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../../src/services/storage/storage.js';
import { DAY, FIXED_NOW, makeCard, makeDeck, makeState } from '../helpers.js';

/** @typedef {import('../../src/services/storage/storage.js').Storage} Storage */
/** @typedef {import('../../src/core/types.js').Asset} Asset */
/** @typedef {import('../../src/core/types.js').ReviewLogEntry} ReviewLogEntry */

/**
 * @param {Partial<Asset>} [overrides]
 * @returns {Asset}
 */
function makeAsset(overrides = {}) {
  return {
    id: 'a_map',
    deckId: 'd_capitals',
    path: 'images/map.png',
    type: 'image/png',
    data: new Blob(['map'], { type: 'image/png' }),
    ...overrides,
  };
}

/**
 * @param {Partial<ReviewLogEntry>} [overrides]
 * @returns {ReviewLogEntry}
 */
function makeLogEntry(overrides = {}) {
  return { cardId: 'c_france', rating: 'good', at: FIXED_NOW, wasNew: true, ...overrides };
}

/**
 * Two decks, each with a card, a state and an asset.
 * @param {Storage} storage
 */
async function fillTwoDecks(storage) {
  await storage.putDeck(makeDeck());
  await storage.putDeck(makeDeck({ id: 'd_chemistry', name: 'Science / Chemistry' }));
  await storage.putCards([
    makeCard(),
    makeCard({ id: 'c_sodium', deckId: 'd_chemistry', front: 'Symbol for sodium?', back: 'Na' }),
  ]);
  await storage.putStates([makeState(), makeState({ cardId: 'c_sodium' })]);
  await storage.putAssets([makeAsset(), makeAsset({ id: 'a_table', deckId: 'd_chemistry' })]);
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} key
 * @returns {string[]}
 */
function keys(items, key) {
  return items.map(key).sort();
}

/**
 * The behaviour every `Storage` adapter must have.
 * @param {string} name
 * @param {() => Storage | Promise<Storage>} makeStorage A new, empty storage per call.
 */
export function runStorageContract(name, makeStorage) {
  describe(`${name} (storage contract)`, () => {
    describe('decks', () => {
      it('starts with no decks', async () => {
        const storage = await makeStorage();
        assert.deepEqual(await storage.getDecks(), []);
        assert.equal(await storage.getDeck('d_capitals'), null);
      });

      it('stores, replaces and lists decks', async () => {
        const storage = await makeStorage();
        await storage.putDeck(makeDeck());
        await storage.putDeck(makeDeck({ id: 'd_chemistry', name: 'Science / Chemistry' }));
        await storage.putDeck(makeDeck({ tags: ['geography'] }));
        assert.deepEqual(await storage.getDeck('d_capitals'), makeDeck({ tags: ['geography'] }));
        assert.deepEqual(
          keys(await storage.getDecks(), (deck) => deck.id),
          ['d_capitals', 'd_chemistry'],
        );
      });

      it('deletes a deck with its cards, their states and its assets', async () => {
        const storage = await makeStorage();
        await fillTwoDecks(storage);
        await storage.addReviewLog(makeLogEntry());
        await storage.deleteDeck('d_capitals');
        assert.equal(await storage.getDeck('d_capitals'), null);
        assert.deepEqual(
          keys(await storage.getCards(), (card) => card.id),
          ['c_sodium'],
        );
        assert.deepEqual(
          keys(await storage.getStates(), (state) => state.cardId),
          ['c_sodium'],
        );
        assert.deepEqual(
          keys(await storage.getAssets(), (asset) => asset.id),
          ['a_table'],
        );
        assert.equal((await storage.getReviewLog()).length, 1);
      });
    });

    describe('cards', () => {
      it('lists every card or one deck’s cards', async () => {
        const storage = await makeStorage();
        await fillTwoDecks(storage);
        assert.deepEqual(
          keys(await storage.getCards(), (card) => card.id),
          ['c_france', 'c_sodium'],
        );
        assert.deepEqual(await storage.getCards('d_capitals'), [makeCard()]);
        assert.deepEqual(await storage.getCards('d_unknown'), []);
      });

      it('replaces a card with the same id', async () => {
        const storage = await makeStorage();
        await storage.putCards([makeCard()]);
        await storage.putCards([makeCard({ back: 'Paris, on the Seine' })]);
        assert.deepEqual(await storage.getCards(), [makeCard({ back: 'Paris, on the Seine' })]);
      });

      it('deletes cards with their states', async () => {
        const storage = await makeStorage();
        await fillTwoDecks(storage);
        await storage.deleteCards(['c_france']);
        assert.deepEqual(
          keys(await storage.getCards(), (card) => card.id),
          ['c_sodium'],
        );
        assert.deepEqual(
          keys(await storage.getStates(), (state) => state.cardId),
          ['c_sodium'],
        );
      });
    });

    describe('states', () => {
      it('stores, replaces and deletes states by card id', async () => {
        const storage = await makeStorage();
        await storage.putState(makeState());
        await storage.putStates([
          makeState({ cardId: 'c_spain' }),
          makeState({ reps: 1, lastReviewed: FIXED_NOW }),
        ]);
        assert.deepEqual(
          (await storage.getStates()).find((state) => state.cardId === 'c_france'),
          makeState({ reps: 1, lastReviewed: FIXED_NOW }),
        );
        await storage.deleteStates(['c_france']);
        assert.deepEqual(await storage.getStates(), [makeState({ cardId: 'c_spain' })]);
      });
    });

    describe('assets', () => {
      it('lists every asset or one deck’s, and reads one by id', async () => {
        const storage = await makeStorage();
        await fillTwoDecks(storage);
        assert.deepEqual(
          keys(await storage.getAssets(), (asset) => asset.id),
          ['a_map', 'a_table'],
        );
        assert.deepEqual(
          keys(await storage.getAssets('d_chemistry'), (asset) => asset.id),
          ['a_table'],
        );
        const asset = await storage.getAsset('a_map');
        assert.equal(asset?.path, 'images/map.png');
        assert.equal(asset?.type, 'image/png');
        assert.equal(await asset?.data.text(), 'map');
        assert.equal(await storage.getAsset('a_unknown'), null);
      });

      it('deletes assets by id', async () => {
        const storage = await makeStorage();
        await fillTwoDecks(storage);
        await storage.deleteAssets(['a_map']);
        assert.deepEqual(
          keys(await storage.getAssets(), (asset) => asset.id),
          ['a_table'],
        );
      });
    });

    describe('review log', () => {
      it('returns entries at or after `since`, oldest first', async () => {
        const storage = await makeStorage();
        await storage.addReviewLog(makeLogEntry({ at: FIXED_NOW }));
        await storage.addReviewLog(makeLogEntry({ at: FIXED_NOW - DAY, rating: 'hard' }));
        await storage.addReviewLog(makeLogEntry({ at: FIXED_NOW - 2 * DAY, rating: 'again' }));
        assert.deepEqual(
          (await storage.getReviewLog(FIXED_NOW - DAY)).map((entry) => entry.rating),
          ['hard', 'good'],
        );
        assert.deepEqual(
          (await storage.getReviewLog()).map((entry) => entry.rating),
          ['again', 'hard', 'good'],
        );
      });

      it('keeps every entry, even two for the same card at the same time', async () => {
        const storage = await makeStorage();
        await storage.addReviewLog(makeLogEntry());
        await storage.addReviewLog(makeLogEntry());
        assert.deepEqual(await storage.getReviewLog(), [makeLogEntry(), makeLogEntry()]);
      });
    });

    describe('settings', () => {
      it('returns the defaults when nothing is stored', async () => {
        const storage = await makeStorage();
        assert.deepEqual(await storage.getSettings(), DEFAULT_SETTINGS);
      });

      it('merges stored settings over the defaults', async () => {
        const storage = await makeStorage();
        const stored = /** @type {import('../../src/core/types.js').Settings} */ (
          /** @type {unknown} */ ({ theme: 'dark' })
        );
        await storage.putSettings(stored);
        assert.deepEqual(await storage.getSettings(), { ...DEFAULT_SETTINGS, theme: 'dark' });
      });

      it('replaces the stored settings', async () => {
        const storage = await makeStorage();
        await storage.putSettings({ newPerDay: 5, theme: 'light', allowRemoteImages: true });
        await storage.putSettings({ ...DEFAULT_SETTINGS, newPerDay: 10 });
        assert.deepEqual(await storage.getSettings(), { ...DEFAULT_SETTINGS, newPerDay: 10 });
      });
    });

    describe('copies', () => {
      it('never hands out or keeps a reference to a stored object', async () => {
        const storage = await makeStorage();
        const deck = makeDeck({ tags: ['geography'] });
        const card = makeCard();
        const state = makeState();
        const entry = makeLogEntry();
        const settings = { ...DEFAULT_SETTINGS };
        await storage.putDeck(deck);
        await storage.putCards([card]);
        await storage.putState(state);
        await storage.addReviewLog(entry);
        await storage.putSettings(settings);
        deck.tags.push('changed');
        card.back = 'changed';
        state.reps = 99;
        entry.rating = 'again';
        settings.newPerDay = 99;
        const readDeck = /** @type {import('../../src/core/types.js').Deck} */ (
          await storage.getDeck('d_capitals')
        );
        readDeck.tags.push('changed');
        (await storage.getCards())[0].back = 'changed';
        (await storage.getStates())[0].reps = 99;
        (await storage.getReviewLog())[0].rating = 'again';
        (await storage.getSettings()).newPerDay = 99;
        assert.deepEqual(await storage.getDeck('d_capitals'), makeDeck({ tags: ['geography'] }));
        assert.deepEqual(await storage.getCards(), [makeCard()]);
        assert.deepEqual(await storage.getStates(), [makeState()]);
        assert.deepEqual(await storage.getReviewLog(), [makeLogEntry()]);
        assert.deepEqual(await storage.getSettings(), DEFAULT_SETTINGS);
      });

      it('returns copies of assets', async () => {
        const storage = await makeStorage();
        await storage.putAssets([makeAsset()]);
        const asset = /** @type {Asset} */ (await storage.getAsset('a_map'));
        asset.path = 'changed.png';
        assert.equal((await storage.getAsset('a_map'))?.path, 'images/map.png');
      });
    });

    describe('clear', () => {
      it('deletes everything and brings back the default settings', async () => {
        const storage = await makeStorage();
        await fillTwoDecks(storage);
        await storage.addReviewLog(makeLogEntry());
        await storage.putSettings({ ...DEFAULT_SETTINGS, theme: 'dark' });
        await storage.clear();
        assert.deepEqual(await storage.getDecks(), []);
        assert.deepEqual(await storage.getCards(), []);
        assert.deepEqual(await storage.getStates(), []);
        assert.deepEqual(await storage.getAssets(), []);
        assert.deepEqual(await storage.getReviewLog(), []);
        assert.deepEqual(await storage.getSettings(), DEFAULT_SETTINGS);
      });
    });

    describe('replaceAll', () => {
      it('replaces everything with the snapshot', async () => {
        const storage = await makeStorage();
        await fillTwoDecks(storage);
        await storage.addReviewLog(makeLogEntry());
        await storage.putSettings({ ...DEFAULT_SETTINGS, theme: 'dark' });
        const deck = makeDeck({ id: 'd_oceans', name: 'Oceans' });
        const card = makeCard({ id: 'c_pacific', deckId: 'd_oceans', front: 'Largest ocean?' });
        const state = makeState({ cardId: 'c_pacific' });
        const asset = makeAsset({ id: 'a_chart', deckId: 'd_oceans' });
        const log = [
          makeLogEntry({ cardId: 'c_pacific', at: FIXED_NOW - DAY, rating: 'hard' }),
          makeLogEntry({ cardId: 'c_pacific' }),
        ];
        const settings = { ...DEFAULT_SETTINGS, newPerDay: 5 };
        await storage.replaceAll({
          decks: [deck],
          cards: [card],
          states: [state],
          assets: [asset],
          reviewLog: log,
          settings,
        });
        assert.deepEqual(await storage.getDecks(), [deck]);
        assert.deepEqual(await storage.getCards(), [card]);
        assert.deepEqual(await storage.getStates(), [state]);
        assert.deepEqual(
          keys(await storage.getAssets(), (item) => item.id),
          ['a_chart'],
        );
        assert.deepEqual(await storage.getReviewLog(), log);
        assert.deepEqual(await storage.getSettings(), settings);
      });

      it('changes nothing when a write fails', async () => {
        const storage = await makeStorage();
        await fillTwoDecks(storage);
        await storage.addReviewLog(makeLogEntry());
        const noId = /** @type {import('../../src/core/types.js').Card} */ (
          /** @type {unknown} */ ({ ...makeCard({ id: 'c_pacific' }), id: undefined })
        );
        await assert.rejects(
          storage.replaceAll({
            decks: [makeDeck({ id: 'd_oceans', name: 'Oceans' })],
            cards: [noId],
            states: [],
            assets: [],
            reviewLog: [],
            settings: { ...DEFAULT_SETTINGS, newPerDay: 5 },
          }),
        );
        assert.deepEqual(
          keys(await storage.getDecks(), (deck) => deck.id),
          ['d_capitals', 'd_chemistry'],
        );
        assert.deepEqual(
          keys(await storage.getCards(), (card) => card.id),
          ['c_france', 'c_sodium'],
        );
        assert.equal((await storage.getStates()).length, 2);
        assert.equal((await storage.getAssets()).length, 2);
        assert.deepEqual(await storage.getReviewLog(), [makeLogEntry()]);
        assert.deepEqual(await storage.getSettings(), DEFAULT_SETTINGS);
      });
    });

    describe('applyImport', () => {
      it('puts the deck, deletes and puts cards and assets, and leaves other decks alone', async () => {
        const storage = await makeStorage();
        await fillTwoDecks(storage);
        await storage.putCards([makeCard({ id: 'c_spain', front: 'Capital of Spain?' })]);
        await storage.putStates([makeState({ cardId: 'c_spain' })]);
        const deck = makeDeck({ tags: ['geography'], updatedAt: FIXED_NOW + DAY });
        const italy = makeCard({ id: 'c_italy', front: 'Capital of Italy?', position: 1 });
        await storage.applyImport({
          deck,
          putCards: [makeCard({ back: 'Paris, on the Seine' }), italy],
          deleteCardIds: ['c_spain'],
          putAssets: [makeAsset({ id: 'a_rome' })],
          deleteAssetIds: ['a_map'],
        });
        assert.deepEqual(await storage.getDeck('d_capitals'), deck);
        assert.deepEqual(
          (await storage.getCards('d_capitals')).sort((a, b) => a.position - b.position),
          [makeCard({ back: 'Paris, on the Seine' }), italy],
        );
        assert.deepEqual(
          keys(await storage.getStates(), (state) => state.cardId),
          ['c_france', 'c_sodium'],
        );
        assert.deepEqual(
          keys(await storage.getAssets(), (asset) => asset.id),
          ['a_rome', 'a_table'],
        );
        assert.deepEqual(
          keys(await storage.getCards('d_chemistry'), (card) => card.id),
          ['c_sodium'],
        );
      });

      it('changes nothing when a write fails', async () => {
        const storage = await makeStorage();
        await fillTwoDecks(storage);
        const noId = /** @type {import('../../src/core/types.js').Card} */ (
          /** @type {unknown} */ ({ ...makeCard({ id: 'c_italy' }), id: undefined })
        );
        await assert.rejects(
          storage.applyImport({
            deck: makeDeck({ tags: ['changed'] }),
            putCards: [noId],
            deleteCardIds: ['c_france'],
            putAssets: [makeAsset({ id: 'a_rome' })],
            deleteAssetIds: ['a_map'],
          }),
        );
        assert.deepEqual(await storage.getDeck('d_capitals'), makeDeck());
        assert.deepEqual(
          keys(await storage.getCards(), (card) => card.id),
          ['c_france', 'c_sodium'],
        );
        assert.deepEqual(
          keys(await storage.getStates(), (state) => state.cardId),
          ['c_france', 'c_sodium'],
        );
        assert.deepEqual(
          keys(await storage.getAssets(), (asset) => asset.id),
          ['a_map', 'a_table'],
        );
      });
    });
  });
}
