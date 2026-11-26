// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sm2 } from '../../src/core/scheduler.js';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupError,
  BackupService,
} from '../../src/services/backup-service.js';
import { DeckService } from '../../src/services/deck-service.js';
import { MemoryStorage } from '../../src/services/storage/memory-storage.js';
import { DEFAULT_SETTINGS } from '../../src/services/storage/storage.js';
import { StudyService } from '../../src/services/study-service.js';
import {
  CAPITALS_DECK,
  CHEMISTRY_DECK,
  FIXED_NOW,
  deckSource,
  fixedClock,
  imageSource,
  importDecks,
} from '../helpers.js';

/** @typedef {import('../../src/services/storage/storage.js').Storage} Storage */

const MAP_DECK = CAPITALS_DECK.replace('Paris', 'Paris ![Map](images/france.png)');

/** Storage holding two decks, an image, review progress and changed settings. */
async function filledStorage() {
  const storage = new MemoryStorage();
  await importDecks(
    new DeckService(storage, fixedClock()),
    deckSource('capitals.md', MAP_DECK),
    deckSource('chemistry.md', CHEMISTRY_DECK),
    imageSource('france.png', 'not really a png ÿ\u0000'),
  );
  const study = new StudyService(storage, sm2, fixedClock());
  let session = await study.startReview(null);
  session = await study.rate(session, 'again');
  await study.rate(session, 'easy');
  await storage.putSettings({ ...DEFAULT_SETTINGS, newPerDay: 7, theme: 'dark' });
  return storage;
}

/**
 * Everything in a storage, with asset data read out, for comparing two storages.
 * @param {Storage} storage
 */
async function snapshot(storage) {
  /** @param {{ id?: string, cardId?: string }} item */
  const key = (item) => String(item.id ?? item.cardId);
  /**
   * @template {{ id?: string, cardId?: string }} T
   * @param {T[]} items
   */
  const sorted = (items) => [...items].sort((a, b) => key(a).localeCompare(key(b)));
  const assets = await storage.getAssets();
  return {
    decks: sorted(await storage.getDecks()),
    cards: sorted(await storage.getCards()),
    states: sorted(await storage.getStates()),
    reviewLog: await storage.getReviewLog(),
    settings: await storage.getSettings(),
    assets: await Promise.all(
      sorted(assets).map(async ({ data, ...asset }) => ({
        ...asset,
        bytes: [...new Uint8Array(await data.arrayBuffer())],
        blobType: data.type,
      })),
    ),
  };
}

/**
 * A valid backup made from `filledStorage`, as plain JSON data.
 * @returns {Promise<any>}
 */
async function validBackup() {
  const backup = await new BackupService(await filledStorage(), fixedClock()).exportBackup();
  return JSON.parse(JSON.stringify(backup));
}

describe('BackupService.exportBackup', () => {
  it('writes everything as JSON-safe data with images in base64', async () => {
    const storage = await filledStorage();
    const backup = await new BackupService(storage, fixedClock()).exportBackup();
    assert.equal(backup.format, BACKUP_FORMAT);
    assert.equal(backup.version, BACKUP_VERSION);
    assert.equal(backup.exportedAt, FIXED_NOW);
    assert.equal(backup.decks.length, 2);
    assert.equal(backup.cards.length, 5);
    assert.equal(backup.states.length, 2);
    assert.equal(backup.reviewLog.length, 2);
    assert.deepEqual(backup.settings, { ...DEFAULT_SETTINGS, newPerDay: 7, theme: 'dark' });
    assert.equal(backup.assets.length, 1);
    const expected = Buffer.from('not really a png ÿ\u0000', 'utf8').toString('base64');
    assert.equal(backup.assets[0].data, expected);
    assert.deepEqual(JSON.parse(JSON.stringify(backup)), backup);
  });
});

describe('BackupService.importBackup', () => {
  it('restores exactly what was exported', async () => {
    const storage = await filledStorage();
    const service = new BackupService(storage, fixedClock());
    const before = await snapshot(storage);
    const json = JSON.stringify(await service.exportBackup());
    await storage.clear();
    await service.importBackup(JSON.parse(json));
    assert.deepEqual(await snapshot(storage), before);
  });

  it('accepts the backup as JSON text and replaces what was stored', async () => {
    const backup = await validBackup();
    const storage = new MemoryStorage();
    await importDecks(
      new DeckService(storage, fixedClock()),
      deckSource('other.md', '# Oceans\n\n## Largest ocean?\n\nPacific\n'),
    );
    await new BackupService(storage, fixedClock()).importBackup(JSON.stringify(backup));
    assert.deepEqual((await storage.getDecks()).map((deck) => deck.name).sort(), [
      'Geography / Capitals',
      'Science / Chemistry',
    ]);
  });

  it('drops fields it does not know', async () => {
    const backup = await validBackup();
    backup.cards[0].extra = 'ignored';
    const storage = new MemoryStorage();
    await new BackupService(storage, fixedClock()).importBackup(backup);
    assert.ok((await storage.getCards()).every((card) => !('extra' in card)));
  });

  it('restores in one step, so a failed write keeps what was stored', async () => {
    const storage = await filledStorage();
    const before = await snapshot(storage);
    const full = new DOMException('The storage is full.', 'QuotaExceededError');
    storage.replaceAll = async () => {
      throw full;
    };
    const service = new BackupService(storage, fixedClock());
    await assert.rejects(service.importBackup(await validBackup()), (error) => error === full);
    assert.deepEqual(await snapshot(storage), before);
  });

  /** @type {[string, (backup: any) => unknown, string][]} */
  const problems = [
    [
      'text that is not JSON',
      () => '{ not json',
      'This file is not a Pocket Flashcards backup. It is not valid JSON.',
    ],
    [
      'something that is not an object',
      () => [1, 2],
      'This file is not a Pocket Flashcards backup.',
    ],
    [
      'another format',
      (b) => ({ ...b, format: 'other' }),
      'This file is not a Pocket Flashcards backup.',
    ],
    [
      'a missing version',
      (b) => ({ ...b, version: undefined }),
      'This backup has no valid version number, so it cannot be imported.',
    ],
    [
      'a newer version',
      (b) => ({ ...b, version: 2 }),
      'This backup was made by a newer version of Pocket Flashcards (backup version 2). Update the app and try again.',
    ],
    [
      'a missing export date',
      (b) => ({ ...b, exportedAt: 'today' }),
      'This backup has no valid export date.',
    ],
    ['missing settings', (b) => ({ ...b, settings: null }), 'This backup has no settings.'],
    [
      'invalid settings',
      (b) => ({ ...b, settings: { ...b.settings, newPerDay: -3 } }),
      'This backup has invalid settings. New cards per day must be a whole number from 0 to 999.',
    ],
    ['a missing list', (b) => ({ ...b, cards: undefined }), 'This backup has no list of cards.'],
    [
      'a record that is not an object',
      (b) => ({ ...b, decks: ['deck'] }),
      'Deck 1 is not a record.',
    ],
    ['a deck with no name', (b) => withRecord(b, 'decks', 1, { name: '' }), 'Deck 2 has no name.'],
    [
      'a deck with bad tags',
      (b) => withRecord(b, 'decks', 0, { tags: 'geography' }),
      'Deck 1 has an invalid tags.',
    ],
    [
      'a card with no front',
      (b) => withRecord(b, 'cards', 2, { front: undefined }),
      'Card 3 has no front.',
    ],
    [
      'a card with a negative position',
      (b) => withRecord(b, 'cards', 0, { position: -1 }),
      'Card 1 has an invalid position.',
    ],
    [
      'a card in a missing deck',
      (b) => withRecord(b, 'cards', 4, { deckId: 'd_unknown' }),
      'Card 5 belongs to a deck that is not in the backup.',
    ],
    [
      'a state with a bad due date',
      (b) => withRecord(b, 'states', 1, { due: 'soon' }),
      'Review state 2 has an invalid due date.',
    ],
    [
      'a state with no suspended flag',
      (b) => withRecord(b, 'states', 0, { suspended: null }),
      'Review state 1 has no suspended flag.',
    ],
    [
      'a log entry with an unknown rating',
      (b) => withRecord(b, 'reviewLog', 0, { rating: 'perfect' }),
      'Review log entry 1 has an invalid rating.',
    ],
    [
      'an image with no type',
      (b) => withRecord(b, 'assets', 0, { type: '' }),
      'Image 1 has no type.',
    ],
    [
      'an image of an unsupported type',
      (b) => withRecord(b, 'assets', 0, { type: 'image/bmp' }),
      'Image 1, "images/france.png", has the type "image/bmp". A backup can hold only PNG, JPEG, GIF, WebP and SVG images.',
    ],
    [
      'an image in a missing deck',
      (b) => withRecord(b, 'assets', 0, { deckId: 'd_unknown' }),
      'Image 1 belongs to a deck that is not in the backup.',
    ],
    [
      'an image that is not base64',
      (b) => withRecord(b, 'assets', 0, { data: 'not base64!' }),
      'Image 1 has data that is not valid base64.',
    ],
  ];

  for (const [what, change, message] of problems) {
    it(`refuses ${what} and keeps what was stored`, async () => {
      const storage = await filledStorage();
      const before = await snapshot(storage);
      const service = new BackupService(storage, fixedClock());
      const input = change(await validBackup());
      await assert.rejects(service.importBackup(input), (error) => {
        assert.ok(error instanceof BackupError);
        assert.equal(error.name, 'BackupError');
        assert.equal(error.message, message);
        return true;
      });
      assert.deepEqual(await snapshot(storage), before);
    });
  }
});

/**
 * A copy of the backup with one record of one list changed.
 * @param {any} backup
 * @param {string} list
 * @param {number} index
 * @param {object} changes
 */
function withRecord(backup, list, index, changes) {
  const records = [...backup[list]];
  records[index] = { ...records[index], ...changes };
  return { ...backup, [list]: records };
}
