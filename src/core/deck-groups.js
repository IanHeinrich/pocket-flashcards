// @ts-check
import { normalizeDeckName } from './ids.js';

/** @typedef {import('./types.js').Deck} Deck */

/**
 * One level of the deck tree. `deck` is set when a deck has exactly this name.
 * @typedef {object} DeckGroupNode
 * @property {string} name This level's part of the name, such as "Chemistry".
 * @property {string} path The full name up to this level, such as "Science / Chemistry".
 * @property {Deck | null} deck
 * @property {DeckGroupNode[]} children
 */

/**
 * Builds a tree from the `/` levels of deck names, with siblings sorted by name.
 * @param {readonly Deck[]} decks
 * @returns {DeckGroupNode[]}
 */
export function groupDecks(decks) {
  /** @type {DeckGroupNode[]} */
  const roots = [];
  for (const deck of decks) {
    const parts = normalizeDeckName(deck.name).split(' / ');
    let siblings = roots;
    parts.forEach((name, index) => {
      const node = findOrAddNode(siblings, name, parts.slice(0, index + 1).join(' / '));
      if (index === parts.length - 1 && node.deck === null) node.deck = deck;
      siblings = node.children;
    });
  }
  return sortNodes(roots);
}

/**
 * @param {DeckGroupNode[]} siblings A list being built by `groupDecks`.
 * @param {string} name
 * @param {string} path
 * @returns {DeckGroupNode}
 */
function findOrAddNode(siblings, name, path) {
  const existing = siblings.find((node) => node.name === name);
  if (existing) return existing;
  /** @type {DeckGroupNode} */
  const node = { name, path, deck: null, children: [] };
  siblings.push(node);
  return node;
}

/**
 * @param {DeckGroupNode[]} nodes
 * @returns {DeckGroupNode[]}
 */
function sortNodes(nodes) {
  return nodes
    .map((node) => ({ ...node, children: sortNodes(node.children) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
