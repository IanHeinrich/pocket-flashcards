// @ts-check

/** @typedef {import('./types.js').Card} Card */

/**
 * Cards whose front or back contains every whitespace-separated term, ignoring case.
 * An empty query matches nothing.
 * @param {readonly Card[]} cards
 * @param {string} query
 * @returns {Card[]}
 */
export function searchCards(cards, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return cards.filter((card) => {
    const text = `${card.front}\n${card.back}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
