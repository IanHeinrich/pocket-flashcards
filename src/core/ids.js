// @ts-check
import { hash } from './hash.js';
import { normalizeAssetPath } from './assets.js';

/**
 * Trims and collapses every run of whitespace to one space.
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Normalises a deck name, including the spacing around `/` group separators,
 * so "Science/Chemistry" and "Science /  Chemistry" are the same deck.
 * @param {string} name
 * @returns {string}
 */
export function normalizeDeckName(name) {
  return name.split('/').map(normalizeText).filter(Boolean).join(' / ');
}

/**
 * @param {string} name
 * @returns {string}
 */
export function deckId(name) {
  return 'd_' + hash(normalizeDeckName(name));
}

/**
 * @param {string} deckId
 * @param {string} front
 * @returns {string}
 */
export function cardId(deckId, front) {
  return 'c_' + hash(deckId + '\u0000' + normalizeText(front));
}

/**
 * @param {string} deckId
 * @param {string} path
 * @returns {string}
 */
export function assetId(deckId, path) {
  return 'a_' + hash(deckId + '\u0000' + normalizeAssetPath(path));
}
