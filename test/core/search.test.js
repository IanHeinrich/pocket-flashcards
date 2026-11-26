// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchCards } from '../../src/core/search.js';
import { makeCard } from '../helpers.js';

const sodium = makeCard({
  id: 'c_sodium',
  front: 'What is the chemical symbol for sodium?',
  back: '**Na**, from the Latin _natrium_.',
});
const potassium = makeCard({
  id: 'c_potassium',
  front: 'What is the chemical symbol for potassium?',
  back: '**K**, from the Latin _kalium_.',
});
const paris = makeCard({ id: 'c_paris', front: 'Capital of France?', back: 'Paris' });
const cards = [sodium, potassium, paris];

describe('searchCards', () => {
  it('finds a term in the front', () => {
    assert.deepEqual(searchCards(cards, 'sodium'), [sodium]);
  });

  it('finds a term in the back', () => {
    assert.deepEqual(searchCards(cards, 'kalium'), [potassium]);
  });

  it('ignores case', () => {
    assert.deepEqual(searchCards(cards, 'PARIS'), [paris]);
  });

  it('requires every term, in the front or the back', () => {
    assert.deepEqual(searchCards(cards, 'symbol latin natrium'), [sodium]);
    assert.deepEqual(searchCards(cards, 'symbol paris'), []);
  });

  it('matches parts of words', () => {
    assert.deepEqual(searchCards(cards, 'chem'), [sodium, potassium]);
  });

  it('keeps the order cards were given in', () => {
    assert.deepEqual(searchCards([potassium, sodium], 'symbol'), [potassium, sodium]);
  });

  it('returns nothing for an empty or blank query', () => {
    assert.deepEqual(searchCards(cards, ''), []);
    assert.deepEqual(searchCards(cards, '   \t '), []);
  });

  it('ignores extra whitespace between terms', () => {
    assert.deepEqual(searchCards(cards, '  symbol   sodium '), [sodium]);
  });
});
