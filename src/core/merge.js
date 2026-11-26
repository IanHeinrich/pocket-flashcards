// @ts-check

/** @typedef {import('./types.js').Card} Card */

/**
 * @typedef {object} CardDiff
 * @property {Card[]} added Incoming cards with an id not stored yet.
 * @property {Card[]} updated Incoming versions of stored cards whose front, back or position changed.
 * @property {Card[]} removed Stored cards whose id is not in the incoming cards.
 * @property {Card[]} unchanged Stored cards that the incoming cards leave as they are.
 */

/**
 * Compares a deck's stored cards with the cards of a new import, matched by id.
 * @param {readonly Card[]} existing
 * @param {readonly Card[]} incoming
 * @returns {CardDiff}
 */
export function diffCards(existing, incoming) {
  const stored = new Map(existing.map((card) => [card.id, card]));
  const incomingIds = new Set(incoming.map((card) => card.id));
  /** @type {CardDiff} */
  const diff = { added: [], updated: [], removed: [], unchanged: [] };
  for (const card of incoming) {
    const previous = stored.get(card.id);
    if (!previous) diff.added.push(card);
    else if (hasChanged(previous, card)) diff.updated.push(card);
    else diff.unchanged.push(previous);
  }
  diff.removed = existing.filter((card) => !incomingIds.has(card.id));
  return diff;
}

/**
 * @param {Card} previous
 * @param {Card} next
 * @returns {boolean}
 */
function hasChanged(previous, next) {
  return (
    previous.front !== next.front ||
    previous.back !== next.back ||
    previous.position !== next.position
  );
}
