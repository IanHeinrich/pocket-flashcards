// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assetId, cardId, deckId, normalizeDeckName, normalizeText } from '../../src/core/ids.js';

describe('normalizeText', () => {
  it('trims and collapses every whitespace run to one space', () => {
    assert.equal(
      normalizeText('  What is\tthe   capital\nof France?  '),
      'What is the capital of France?',
    );
  });
});

describe('normalizeDeckName', () => {
  it('puts one space on each side of every group separator', () => {
    assert.equal(normalizeDeckName('Science/Chemistry'), 'Science / Chemistry');
    assert.equal(
      normalizeDeckName('  Science  /   Chemistry basics '),
      'Science / Chemistry basics',
    );
  });

  it('drops empty levels', () => {
    assert.equal(normalizeDeckName('/Science//Chemistry/'), 'Science / Chemistry');
  });

  it('keeps case', () => {
    assert.notEqual(normalizeDeckName('science'), normalizeDeckName('Science'));
  });
});

describe('deckId', () => {
  it('is prefixed with d_', () => {
    assert.match(deckId('Geography / Capitals'), /^d_[0-9a-z]+$/);
  });

  it('ignores spacing differences in the name', () => {
    assert.equal(deckId('Geography/Capitals'), deckId(' Geography  /  Capitals '));
  });

  it('tells names apart by case', () => {
    assert.notEqual(deckId('Capitals'), deckId('capitals'));
  });
});

describe('cardId', () => {
  const deck = deckId('Geography / Capitals');

  it('is prefixed with c_', () => {
    assert.match(cardId(deck, 'What is the capital of France?'), /^c_[0-9a-z]+$/);
  });

  it('keeps identity through cosmetic whitespace edits to the front', () => {
    assert.equal(
      cardId(deck, 'What is the capital of France?'),
      cardId(deck, '  What is  the capital\nof France? '),
    );
  });

  it('changes when the front is reworded', () => {
    assert.notEqual(
      cardId(deck, 'What is the capital of France?'),
      cardId(deck, 'Which city is the capital of France?'),
    );
  });

  it('differs between decks for the same front', () => {
    assert.notEqual(
      cardId(deckId('Geography / Capitals'), 'Paris'),
      cardId(deckId('Geography / Cities'), 'Paris'),
    );
  });
});

describe('assetId', () => {
  const deck = deckId('Science / Chemistry');

  it('is prefixed with a_', () => {
    assert.match(assetId(deck, 'images/periodic-table.png'), /^a_[0-9a-z]+$/);
  });

  it('treats equivalent spellings of a path as the same asset', () => {
    const id = assetId(deck, 'images/periodic-table.png');
    assert.equal(assetId(deck, './images/periodic-table.png'), id);
    assert.equal(assetId(deck, 'images\\periodic-table.png'), id);
    assert.equal(assetId(deck, '/images//periodic-table.png'), id);
  });

  it('differs between decks for the same path', () => {
    assert.notEqual(
      assetId(deckId('Science / Chemistry'), 'a.png'),
      assetId(deckId('Science / Physics'), 'a.png'),
    );
  });
});
