// @ts-check
import { isSupportedImageType } from './deck-service.js';
import { findSettingsProblem } from './settings-service.js';

/** @typedef {import('./clock.js').Clock} Clock */
/** @typedef {import('./storage/storage.js').Storage} Storage */
/** @typedef {import('../core/types.js').Asset} Asset */
/** @typedef {import('../core/types.js').Card} Card */
/** @typedef {import('../core/types.js').Deck} Deck */
/** @typedef {import('../core/types.js').ReviewLogEntry} ReviewLogEntry */
/** @typedef {import('../core/types.js').ReviewState} ReviewState */
/** @typedef {import('../core/types.js').Settings} Settings */

/**
 * An asset in a backup file: its data is base64 text instead of a Blob.
 * @typedef {Omit<Asset, 'data'> & { data: string }} BackupAsset
 */

/**
 * @typedef {object} Backup
 * @property {typeof BACKUP_FORMAT} format
 * @property {number} version
 * @property {number} exportedAt
 * @property {Deck[]} decks
 * @property {Card[]} cards
 * @property {ReviewState[]} states
 * @property {ReviewLogEntry[]} reviewLog
 * @property {Settings} settings
 * @property {BackupAsset[]} assets
 */

/**
 * One field of a record and how to check it.
 * @typedef {object} FieldRule
 * @property {string} key
 * @property {string} label How a person would name it.
 * @property {(value: unknown) => boolean} valid
 * @property {boolean} [optional]
 */

/** @typedef {Record<string, unknown>} Fields */

export const BACKUP_FORMAT = 'pocket-flashcards-backup';
export const BACKUP_VERSION = 1;

const NOT_A_BACKUP = 'This file is not a Pocket Flashcards backup.';
const RATINGS = ['again', 'hard', 'good', 'easy'];
const CHUNK_SIZE = 0x8000;

/** @param {unknown} value */
const isText = (value) => typeof value === 'string' && value !== '';
/** @param {unknown} value */
const isString = (value) => typeof value === 'string';
/** @param {unknown} value */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
/** @param {unknown} value */
const isCount = (value) => Number.isInteger(value) && Number(value) >= 0;
/** @param {unknown} value */
const isBoolean = (value) => typeof value === 'boolean';

/** @type {Record<'decks' | 'cards' | 'states' | 'reviewLog' | 'assets', { label: string, fields: FieldRule[] }>} */
const RECORDS = {
  decks: {
    label: 'Deck',
    fields: [
      { key: 'id', label: 'id', valid: isText },
      { key: 'name', label: 'name', valid: isText },
      {
        key: 'tags',
        label: 'tags',
        valid: (value) => Array.isArray(value) && value.every(isString),
      },
      { key: 'description', label: 'description', valid: isString, optional: true },
      { key: 'importedAt', label: 'import date', valid: isNumber },
      { key: 'updatedAt', label: 'update date', valid: isNumber },
    ],
  },
  cards: {
    label: 'Card',
    fields: [
      { key: 'id', label: 'id', valid: isText },
      { key: 'deckId', label: 'deck id', valid: isText },
      { key: 'front', label: 'front', valid: isText },
      { key: 'back', label: 'back', valid: isString },
      { key: 'position', label: 'position', valid: isCount },
    ],
  },
  states: {
    label: 'Review state',
    fields: [
      { key: 'cardId', label: 'card id', valid: isText },
      { key: 'due', label: 'due date', valid: isNumber },
      { key: 'interval', label: 'interval', valid: isCount },
      { key: 'ease', label: 'ease', valid: isNumber },
      { key: 'reps', label: 'repetition count', valid: isCount },
      { key: 'lapses', label: 'lapse count', valid: isCount },
      {
        key: 'lastReviewed',
        label: 'last review date',
        valid: (value) => value === null || isNumber(value),
      },
      { key: 'suspended', label: 'suspended flag', valid: isBoolean },
    ],
  },
  reviewLog: {
    label: 'Review log entry',
    fields: [
      { key: 'cardId', label: 'card id', valid: isText },
      {
        key: 'rating',
        label: 'rating',
        valid: (value) => typeof value === 'string' && RATINGS.includes(value),
      },
      { key: 'at', label: 'time', valid: isNumber },
      { key: 'wasNew', label: 'new-card flag', valid: isBoolean },
    ],
  },
  assets: {
    label: 'Image',
    fields: [
      { key: 'id', label: 'id', valid: isText },
      { key: 'deckId', label: 'deck id', valid: isText },
      { key: 'path', label: 'path', valid: isText },
      { key: 'type', label: 'type', valid: isText },
      { key: 'data', label: 'data', valid: isString },
    ],
  },
};

/** A backup file that cannot be imported. The message says why, in plain words. */
export class BackupError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'BackupError';
  }
}

export class BackupService {
  /** @type {Storage} */
  #storage;
  /** @type {Clock} */
  #clock;

  /**
   * @param {Storage} storage
   * @param {Clock} clock
   */
  constructor(storage, clock) {
    this.#storage = storage;
    this.#clock = clock;
  }

  /**
   * Everything stored, as a JSON-safe object.
   * @returns {Promise<Backup>}
   */
  async exportBackup() {
    const [decks, cards, states, reviewLog, settings, assets] = await Promise.all([
      this.#storage.getDecks(),
      this.#storage.getCards(),
      this.#storage.getStates(),
      this.#storage.getReviewLog(),
      this.#storage.getSettings(),
      this.#storage.getAssets(),
    ]);
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: this.#clock.now(),
      decks,
      cards,
      states,
      reviewLog,
      settings,
      assets: await Promise.all(
        assets.map(async ({ data, ...asset }) => ({ ...asset, data: await blobToBase64(data) })),
      ),
    };
  }

  /**
   * Checks a backup and, only if all of it is valid, replaces everything stored with it.
   * Throws a `BackupError` naming the first problem.
   * @param {unknown} json The parsed backup, or its JSON text.
   * @returns {Promise<void>}
   */
  async importBackup(json) {
    const backup = readBackup(typeof json === 'string' ? parseJson(json) : json);
    const assets = backup.assets.map((asset, index) => ({
      ...asset,
      data: base64ToBlob(asset.data, asset.type, index),
    }));
    await this.#storage.replaceAll({
      decks: backup.decks,
      cards: backup.cards,
      states: backup.states,
      assets,
      reviewLog: backup.reviewLog,
      settings: backup.settings,
    });
  }
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new BackupError(`${NOT_A_BACKUP} It is not valid JSON.`);
  }
}

/**
 * Validates a parsed backup and keeps only the known fields of each record.
 * @param {unknown} value
 * @returns {Backup}
 */
function readBackup(value) {
  if (!isObject(value) || value.format !== BACKUP_FORMAT) throw new BackupError(NOT_A_BACKUP);
  const { version } = value;
  if (!Number.isInteger(version) || Number(version) < 1) {
    throw new BackupError('This backup has no valid version number, so it cannot be imported.');
  }
  if (Number(version) > BACKUP_VERSION) {
    throw new BackupError(
      `This backup was made by a newer version of Pocket Flashcards (backup version ${version}). Update the app and try again.`,
    );
  }
  if (!isNumber(value.exportedAt)) throw new BackupError('This backup has no valid export date.');
  if (!isObject(value.settings)) throw new BackupError('This backup has no settings.');
  const settingsProblem = findSettingsProblem(value.settings);
  if (settingsProblem)
    throw new BackupError(`This backup has invalid settings. ${settingsProblem}`);
  const decks = /** @type {Deck[]} */ (readRecords(value, 'decks'));
  const cards = /** @type {Card[]} */ (readRecords(value, 'cards'));
  const states = /** @type {ReviewState[]} */ (readRecords(value, 'states'));
  const reviewLog = /** @type {ReviewLogEntry[]} */ (readRecords(value, 'reviewLog'));
  const assets = /** @type {BackupAsset[]} */ (readRecords(value, 'assets'));
  const deckIds = new Set(decks.map((deck) => deck.id));
  checkDeckLinks(cards, deckIds, 'Card');
  checkDeckLinks(assets, deckIds, 'Image');
  checkImageTypes(assets);
  return {
    format: BACKUP_FORMAT,
    version: Number(version),
    exportedAt: Number(value.exportedAt),
    decks,
    cards,
    states,
    reviewLog,
    settings: /** @type {Settings} */ ({ ...value.settings }),
    assets,
  };
}

/**
 * @param {Fields} backup
 * @param {keyof typeof RECORDS} key
 * @returns {Fields[]} Each record with only its known fields.
 */
function readRecords(backup, key) {
  const list = backup[key];
  if (!Array.isArray(list)) throw new BackupError(`This backup has no list of ${key}.`);
  const { label, fields } = RECORDS[key];
  return list.map((record, index) => {
    const name = `${label} ${index + 1}`;
    if (!isObject(record)) throw new BackupError(`${name} is not a record.`);
    /** @type {Fields} */
    const kept = {};
    for (const field of fields) {
      const item = record[field.key];
      if (item === undefined && field.optional) continue;
      if (item === undefined || item === null || item === '') {
        if (!field.valid(item)) throw new BackupError(`${name} has no ${field.label}.`);
      } else if (!field.valid(item)) {
        throw new BackupError(`${name} has an invalid ${field.label}.`);
      }
      kept[field.key] = item;
    }
    return kept;
  });
}

/**
 * @param {readonly { deckId: string }[]} records
 * @param {Set<string>} deckIds
 * @param {string} label
 */
function checkDeckLinks(records, deckIds, label) {
  const index = records.findIndex((record) => !deckIds.has(record.deckId));
  if (index !== -1) {
    throw new BackupError(`${label} ${index + 1} belongs to a deck that is not in the backup.`);
  }
}

/** @param {readonly BackupAsset[]} assets */
function checkImageTypes(assets) {
  const index = assets.findIndex((asset) => !isSupportedImageType(asset.type));
  if (index !== -1) {
    const { path, type } = assets[index];
    throw new BackupError(
      `Image ${index + 1}, "${path}", has the type "${type}". A backup can hold only PNG, JPEG, GIF, WebP and SVG images.`,
    );
  }
}

/**
 * @param {unknown} value
 * @returns {value is Fields}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK_SIZE));
  }
  return btoa(binary);
}

/**
 * @param {string} text
 * @param {string} type
 * @param {number} index The asset's place in the backup, for the error message.
 * @returns {Blob}
 */
function base64ToBlob(text, type, index) {
  let binary;
  try {
    binary = atob(text);
  } catch {
    throw new BackupError(`Image ${index + 1} has data that is not valid base64.`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
