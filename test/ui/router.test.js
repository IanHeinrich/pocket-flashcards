// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRoute, parseRoute } from '../../src/ui/router.js';

/** @typedef {import('../../src/ui/router.js').Route} Route */

test('an empty hash and "#/" are the decks page', () => {
  assert.deepEqual(parseRoute(''), { name: 'decks' });
  assert.deepEqual(parseRoute('#'), { name: 'decks' });
  assert.deepEqual(parseRoute('#/'), { name: 'decks' });
});

test('pages without parameters', () => {
  assert.deepEqual(parseRoute('#/import'), { name: 'import' });
  assert.deepEqual(parseRoute('#/settings'), { name: 'settings' });
  assert.deepEqual(parseRoute('#/search'), { name: 'search' });
  assert.deepEqual(parseRoute('#/import/'), { name: 'import' });
});

test('a deck page carries the decoded deck id', () => {
  assert.deepEqual(parseRoute('#/deck/d_abc123'), { name: 'deck', deckId: 'd_abc123' });
  assert.deepEqual(parseRoute('#/deck/d%20x'), { name: 'deck', deckId: 'd x' });
});

test('review and practice take "all" or a comma list of deck ids', () => {
  assert.deepEqual(parseRoute('#/review/all'), { name: 'review', deckIds: null });
  assert.deepEqual(parseRoute('#/review/d_a,d_b'), { name: 'review', deckIds: ['d_a', 'd_b'] });
  assert.deepEqual(parseRoute('#/practice/all'), { name: 'practice', deckIds: null, tag: null });
  assert.deepEqual(parseRoute('#/practice/d_a'), { name: 'practice', deckIds: ['d_a'], tag: null });
});

test('an encoded comma stays inside one deck id', () => {
  assert.deepEqual(parseRoute('#/review/a%2Cb,c'), { name: 'review', deckIds: ['a,b', 'c'] });
});

test('practice reads an optional tag from the query', () => {
  assert.deepEqual(parseRoute('#/practice/all?tag=geography'), {
    name: 'practice',
    deckIds: null,
    tag: 'geography',
  });
  assert.deepEqual(parseRoute('#/practice/all?tag='), {
    name: 'practice',
    deckIds: null,
    tag: null,
  });
});

test('unknown or malformed hashes are not found', () => {
  for (const hash of [
    '#/nope',
    '#/deck',
    '#/review',
    '#/review/,',
    '#/import/extra',
    '#/deck/a/b',
    '#/deck/%E0%A4%A',
  ]) {
    assert.deepEqual(parseRoute(hash), { name: 'not-found' }, hash);
  }
});

test('formatRoute builds hashes', () => {
  assert.equal(formatRoute({ name: 'decks' }), '#/');
  assert.equal(formatRoute({ name: 'import' }), '#/import');
  assert.equal(formatRoute({ name: 'deck', deckId: 'd_1' }), '#/deck/d_1');
  assert.equal(formatRoute({ name: 'review', deckIds: null }), '#/review/all');
  assert.equal(formatRoute({ name: 'review', deckIds: ['d_1', 'd_2'] }), '#/review/d_1,d_2');
  assert.equal(
    formatRoute({ name: 'practice', deckIds: null, tag: 'a b' }),
    '#/practice/all?tag=a%20b',
  );
  assert.equal(formatRoute({ name: 'not-found' }), '#/');
});

test('parseRoute reads back what formatRoute writes', () => {
  /** @type {Route[]} */
  const routes = [
    { name: 'decks' },
    { name: 'deck', deckId: 'd_weird id,/?#' },
    { name: 'review', deckIds: null },
    { name: 'review', deckIds: ['d_a', 'd,b'] },
    { name: 'practice', deckIds: ['d_a'], tag: null },
    { name: 'practice', deckIds: null, tag: 'chemistry & physics' },
    { name: 'import' },
    { name: 'settings' },
    { name: 'search' },
  ];
  for (const route of routes) assert.deepEqual(parseRoute(formatRoute(route)), route);
});
