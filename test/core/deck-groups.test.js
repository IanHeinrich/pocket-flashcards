// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupDecks } from '../../src/core/deck-groups.js';
import { makeDeck } from '../helpers.js';

/** @typedef {import('../../src/core/deck-groups.js').DeckGroupNode} DeckGroupNode */

/**
 * @param {DeckGroupNode[]} nodes
 * @returns {unknown[]}
 */
function shape(nodes) {
  return nodes.map((node) => ({
    name: node.name,
    path: node.path,
    deck: node.deck?.id ?? null,
    children: shape(node.children),
  }));
}

describe('groupDecks', () => {
  it('returns an empty tree for no decks', () => {
    assert.deepEqual(groupDecks([]), []);
  });

  it('puts a deck without groups at the top level', () => {
    const capitals = makeDeck({ id: 'd_capitals', name: 'Capitals' });
    assert.deepEqual(groupDecks([capitals]), [
      { name: 'Capitals', path: 'Capitals', deck: capitals, children: [] },
    ]);
  });

  it('nests decks under their groups', () => {
    const decks = [
      makeDeck({ id: 'd_chem', name: 'Science / Chemistry' }),
      makeDeck({ id: 'd_phys', name: 'Science / Physics / Mechanics' }),
    ];
    assert.deepEqual(shape(groupDecks(decks)), [
      {
        name: 'Science',
        path: 'Science',
        deck: null,
        children: [
          { name: 'Chemistry', path: 'Science / Chemistry', deck: 'd_chem', children: [] },
          {
            name: 'Physics',
            path: 'Science / Physics',
            deck: null,
            children: [
              {
                name: 'Mechanics',
                path: 'Science / Physics / Mechanics',
                deck: 'd_phys',
                children: [],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('puts a deck whose name is also a group on that group node', () => {
    const decks = [
      makeDeck({ id: 'd_chem_acids', name: 'Chemistry / Acids' }),
      makeDeck({ id: 'd_chem', name: 'Chemistry' }),
    ];
    assert.deepEqual(shape(groupDecks(decks)), [
      {
        name: 'Chemistry',
        path: 'Chemistry',
        deck: 'd_chem',
        children: [
          { name: 'Acids', path: 'Chemistry / Acids', deck: 'd_chem_acids', children: [] },
        ],
      },
    ]);
  });

  it('treats differently spaced names as the same group', () => {
    const decks = [
      makeDeck({ id: 'd_a', name: 'Geography/Capitals' }),
      makeDeck({ id: 'd_b', name: '  Geography /  Rivers ' }),
    ];
    const [geography] = groupDecks(decks);
    assert.equal(groupDecks(decks).length, 1);
    assert.deepEqual(
      geography.children.map((node) => node.path),
      ['Geography / Capitals', 'Geography / Rivers'],
    );
  });

  it('sorts siblings by name at every level', () => {
    const decks = [
      makeDeck({ id: 'd_1', name: 'Science / Physics' }),
      makeDeck({ id: 'd_2', name: 'Geography' }),
      makeDeck({ id: 'd_3', name: 'Science / Chemistry' }),
      makeDeck({ id: 'd_4', name: 'Art' }),
    ];
    const tree = groupDecks(decks);
    assert.deepEqual(
      tree.map((node) => node.name),
      ['Art', 'Geography', 'Science'],
    );
    assert.deepEqual(
      tree[2].children.map((node) => node.name),
      ['Chemistry', 'Physics'],
    );
  });

  it('does not change the decks it was given', () => {
    const decks = [makeDeck({ name: 'Science / Chemistry' })];
    const before = JSON.stringify(decks);
    groupDecks(decks);
    assert.equal(JSON.stringify(decks), before);
  });
});
