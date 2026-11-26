// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck, serializeDeck } from '../../src/core/deck-format.js';
import { rng } from '../helpers.js';

/** @typedef {import('../../src/core/types.js').DeckMeta} DeckMeta */

/**
 * @param {string[]} lines
 * @returns {string}
 */
function deck(lines) {
  return lines.join('\n');
}

/**
 * @param {import('../../src/core/types.js').ParsedDeck} parsed
 * @returns {{ front: string, back: string }[]}
 */
function pairs(parsed) {
  return parsed.cards.map(({ front, back }) => ({ front, back }));
}

const NO_NAME = 'This deck has no name. Add a `deck:` line in front matter or a `# Name` heading.';

describe('parseDeck: front matter', () => {
  it('reads deck, tags and description', () => {
    const parsed = parseDeck(
      deck([
        '---',
        'deck: Science / Chemistry basics',
        'tags: [science, chemistry]',
        'description: Symbols, units and a few reactions.',
        '---',
        '',
        '## Symbol for sodium?',
        '',
        'Na',
      ]),
    );
    assert.deepEqual(parsed.meta, {
      name: 'Science / Chemistry basics',
      tags: ['science', 'chemistry'],
      description: 'Symbols, units and a few reactions.',
    });
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(parsed.warnings, []);
  });

  it('reads tags with or without brackets, and quoted tags', () => {
    /** @param {string} value */
    const tagsOf = (value) =>
      parseDeck(`---\ndeck: Chemistry\ntags: ${value}\n---\n## Na\nSodium`).meta.tags;
    assert.deepEqual(tagsOf('science, chemistry'), ['science', 'chemistry']);
    assert.deepEqual(tagsOf('[ science ,chemistry, ]'), ['science', 'chemistry']);
    assert.deepEqual(tagsOf(`["a, b", 'c', d]`), ['a, b', 'c', 'd']);
    assert.deepEqual(tagsOf('[]'), []);
  });

  it('removes quotes around the deck name and description', () => {
    const parsed = parseDeck(`---\ndeck: "Capitals: Europe"\ndescription: 'Cities'\n---\n## A\nB`);
    assert.equal(parsed.meta.name, 'Capitals: Europe');
    assert.equal(parsed.meta.description, 'Cities');
  });

  it('defaults tags to an empty list and leaves out a missing description', () => {
    assert.deepEqual(parseDeck('---\ndeck: Capitals\n---\n## A\nB').meta, {
      name: 'Capitals',
      tags: [],
    });
  });

  it('warns about unknown keys and lines that are not key: value', () => {
    const parsed = parseDeck('---\ndeck: Capitals\nauthor: me\njust text\n---\n## A\nB');
    assert.deepEqual(
      parsed.warnings.map((warning) => warning.line),
      [3, 4],
    );
    assert.match(parsed.warnings[0].message, /author/);
    assert.deepEqual(parsed.errors, []);
  });

  it('only reads front matter that starts on the very first line', () => {
    const parsed = parseDeck('\n---\ndeck: Capitals\n---\n## A\nB', { fallbackName: 'file.md' });
    assert.equal(parsed.meta.name, 'file');
  });

  it('warns and ignores front matter that is never closed', () => {
    const parsed = parseDeck('---\ndeck: Capitals\n## A\nB', { fallbackName: 'cities.md' });
    assert.equal(parsed.meta.name, 'cities');
    assert.deepEqual(pairs(parsed), [{ front: 'A', back: 'B' }]);
    assert.equal(parsed.warnings[0].line, 1);
  });
});

describe('parseDeck: deck name', () => {
  it('prefers the front matter name over a heading and the file name', () => {
    const parsed = parseDeck('---\ndeck: Capitals\n---\n# Cities\n## A\nB', {
      fallbackName: 'file.md',
    });
    assert.equal(parsed.meta.name, 'Capitals');
  });

  it('uses a # heading before the first card when there is no front matter name', () => {
    const parsed = parseDeck('Notes to self.\n\n# Geography / Capitals\n\n## A\nB', {
      fallbackName: 'file.md',
    });
    assert.equal(parsed.meta.name, 'Geography / Capitals');
  });

  it('ignores a # heading after the first card or inside code', () => {
    const parsed = parseDeck('```\n# Code\n```\n## A\nB\n# Late', { fallbackName: 'file.md' });
    assert.equal(parsed.meta.name, 'file');
  });

  it('falls back to the file name without .md', () => {
    assert.equal(parseDeck('## A\nB', { fallbackName: 'Capitals.md' }).meta.name, 'Capitals');
    assert.equal(parseDeck('## A\nB', { fallbackName: 'Capitals.MD' }).meta.name, 'Capitals');
    assert.equal(parseDeck('## A\nB', { fallbackName: 'Capitals' }).meta.name, 'Capitals');
  });

  it('reports an error on line 0 when there is no name at all', () => {
    const parsed = parseDeck('## A\nB');
    assert.equal(parsed.meta.name, '');
    assert.deepEqual(parsed.errors, [{ line: 0, message: NO_NAME }]);
  });

  it('normalises spacing in the name, including around /', () => {
    assert.equal(
      parseDeck('---\ndeck:  Science/Chemistry   basics \n---\n## A\nB').meta.name,
      'Science / Chemistry basics',
    );
  });
});

describe('parseDeck: cards', () => {
  it('reads each ## heading as a front and the text below as its back', () => {
    const parsed = parseDeck(
      deck([
        '# Capitals',
        'Text before the first card is ignored.',
        '## What is the capital of France?',
        '',
        '**Paris**',
        '',
        '### On the Seine',
        '',
        '## What is the capital of Spain?',
        'Madrid',
      ]),
    );
    assert.deepEqual(parsed.cards, [
      {
        front: 'What is the capital of France?',
        back: '**Paris**\n\n### On the Seine',
        line: 3,
      },
      { front: 'What is the capital of Spain?', back: 'Madrid', line: 9 },
    ]);
  });

  it('counts line numbers from the top of the file, front matter included', () => {
    const parsed = parseDeck('---\ndeck: Capitals\n---\n\n## A\nB\n## C\nD');
    assert.deepEqual(
      parsed.cards.map((card) => card.line),
      [5, 7],
    );
  });

  it('strips a byte order mark and accepts CRLF line endings', () => {
    const bom = String.fromCharCode(0xfeff);
    const parsed = parseDeck(`${bom}---\r\ndeck: Capitals\r\n---\r\n## A\r\nB\r\n\r\nC\r\n`);
    assert.equal(parsed.meta.name, 'Capitals');
    assert.deepEqual(pairs(parsed), [{ front: 'A', back: 'B\n\nC' }]);
  });

  it('does not start a card at a ## inside a fenced code block', () => {
    const parsed = parseDeck(
      deck([
        '# Code',
        '## Markdown headings',
        '```markdown',
        '## Not a card',
        '```',
        '~~~',
        '## Still not a card',
        '~~~',
        '````',
        '```',
        '## Inside a longer fence',
        '````',
      ]),
    );
    assert.equal(parsed.cards.length, 1);
    assert.match(parsed.cards[0].back, /## Inside a longer fence\n````$/);
  });

  it('needs a space after ## and no third #', () => {
    const parsed = parseDeck('# D\n## A\n##B\n### C\n## #D');
    assert.deepEqual(pairs(parsed), [{ front: 'A', back: '##B\n### C\n## #D' }]);
  });

  it('splits front and back at a --- line, adding the lines above to the front', () => {
    const parsed = parseDeck(
      deck([
        '# Chemistry',
        '## Water molecule',
        '',
        'What does this diagram show?',
        '',
        '---',
        '',
        'One oxygen bonded to two hydrogens.',
        '',
        '---',
        '',
        'A second rule stays in the back.',
      ]),
    );
    assert.deepEqual(pairs(parsed), [
      {
        front: 'Water molecule\n\nWhat does this diagram show?',
        back: 'One oxygen bonded to two hydrogens.\n\n---\n\nA second rule stays in the back.',
      },
    ]);
  });

  it('keeps just the heading as the front when nothing is above the ---', () => {
    const parsed = parseDeck('# D\n## Sodium\n\n---\n\nNa');
    assert.deepEqual(pairs(parsed), [{ front: 'Sodium', back: 'Na' }]);
  });

  it('ignores a --- inside a fenced code block', () => {
    const parsed = parseDeck('# D\n## YAML\n```\n---\n```\nFront matter delimiter');
    assert.deepEqual(pairs(parsed), [
      { front: 'YAML', back: '```\n---\n```\nFront matter delimiter' },
    ]);
  });

  it('makes two cards from A <-> B with nothing below', () => {
    const parsed = parseDeck('# D\n\n## Avogadro constant <-> 6.022 × 10²³\n\n## Na <-> Sodium');
    assert.deepEqual(parsed.cards, [
      { front: 'Avogadro constant', back: '6.022 × 10²³', line: 3 },
      { front: '6.022 × 10²³', back: 'Avogadro constant', line: 3 },
      { front: 'Na', back: 'Sodium', line: 5 },
      { front: 'Sodium', back: 'Na', line: 5 },
    ]);
    assert.deepEqual(parsed.warnings, []);
  });

  it('keeps A <-> B as one card, with a warning, when there is text below', () => {
    const parsed = parseDeck('# D\n## Na <-> Sodium\nAn alkali metal.');
    assert.deepEqual(pairs(parsed), [{ front: 'Na <-> Sodium', back: 'An alkali metal.' }]);
    assert.equal(parsed.warnings.length, 1);
    assert.equal(parsed.warnings[0].line, 2);
    assert.match(parsed.warnings[0].message, /<->/);
  });

  it('keeps the first of two cards with the same front and warns with both lines', () => {
    const parsed = parseDeck('# D\n## Capital of France?\nParis\n##  Capital  of France? \nLyon');
    assert.deepEqual(pairs(parsed), [{ front: 'Capital of France?', back: 'Paris' }]);
    assert.equal(parsed.warnings.length, 1);
    assert.equal(parsed.warnings[0].line, 4);
    assert.match(parsed.warnings[0].message, /\b2\b.*\b4\b/);
  });

  it('keeps a card with no answer, with a warning', () => {
    const parsed = parseDeck('# D\n## Capital of France?\n\n## Capital of Spain?\nMadrid');
    assert.deepEqual(pairs(parsed), [
      { front: 'Capital of France?', back: '' },
      { front: 'Capital of Spain?', back: 'Madrid' },
    ]);
    assert.equal(parsed.warnings.length, 1);
    assert.equal(parsed.warnings[0].line, 2);
    assert.match(parsed.warnings[0].message, /^Card has no answer/);
  });

  it('skips a card whose heading has no text, with an error', () => {
    const parsed = parseDeck('# D\n##   \nOrphan back\n## A\nB');
    assert.deepEqual(pairs(parsed), [{ front: 'A', back: 'B' }]);
    assert.equal(parsed.errors.length, 1);
    assert.equal(parsed.errors[0].line, 2);
  });

  it('warns when the deck has no cards', () => {
    const parsed = parseDeck('# Empty deck\nJust notes.');
    assert.deepEqual(parsed.cards, []);
    assert.deepEqual(
      parsed.warnings.map((warning) => warning.line),
      [0],
    );
  });

  it('parses an empty file to no cards and a missing name', () => {
    const parsed = parseDeck('');
    assert.deepEqual(parsed.cards, []);
    assert.deepEqual(parsed.errors, [{ line: 0, message: NO_NAME }]);
  });
});

describe('serializeDeck', () => {
  it('writes front matter and one block per card', () => {
    const text = serializeDeck(
      { name: 'Science / Chemistry', tags: ['science', 'chemistry'], description: 'Basics.' },
      [
        { front: 'Symbol for sodium?', back: '**Na**' },
        { front: 'Water molecule\n\n```mermaid\ngraph LR\n  H --- O\n```', back: 'H2O' },
      ],
    );
    assert.equal(
      text,
      deck([
        '---',
        'deck: Science / Chemistry',
        'tags: [science, chemistry]',
        'description: Basics.',
        '---',
        '',
        '## Symbol for sodium?',
        '',
        '**Na**',
        '',
        '## Water molecule',
        '',
        '```mermaid',
        'graph LR',
        '  H --- O',
        '```',
        '',
        '---',
        '',
        'H2O',
        '',
      ]),
    );
  });

  it('leaves out empty tags and a missing description', () => {
    assert.equal(serializeDeck({ name: 'Capitals', tags: [] }, []), '---\ndeck: Capitals\n---\n');
  });

  it('adds a --- line when the back has a rule that would otherwise split the card', () => {
    const text = serializeDeck({ name: 'D', tags: [] }, [
      { front: 'Q', back: 'One\n\n---\n\nTwo' },
    ]);
    assert.match(text, /## Q\n\n---\n\nOne\n\n---\n\nTwo\n$/);
  });

  it('does not add a --- line for a rule inside code in the back', () => {
    const text = serializeDeck({ name: 'D', tags: [] }, [{ front: 'Q', back: '```\n---\n```' }]);
    assert.match(text, /## Q\n\n```\n---\n```\n$/);
  });
});

describe('parseDeck(serializeDeck(meta, cards))', () => {
  /**
   * @param {DeckMeta} meta
   * @param {{ front: string, back: string }[]} cards
   */
  function assertRoundTrip(meta, cards) {
    const parsed = parseDeck(serializeDeck(meta, cards));
    assert.deepEqual(parsed.meta, meta);
    assert.deepEqual(pairs(parsed), cards);
    assert.deepEqual(parsed.errors, []);
  }

  it('gives back the meta and cards for hand-picked cases', () => {
    assertRoundTrip({ name: 'Capitals', tags: [] }, [
      { front: 'Capital of France?', back: 'Paris' },
    ]);
    assertRoundTrip(
      { name: '"Quoted" names', tags: ['a, b', '"q"', '[x]', 'plain'], description: "'Quoted'" },
      [{ front: 'Q', back: 'A' }],
    );
    assertRoundTrip({ name: 'Unicode / Ünïcødé 化学', tags: ['日本'] }, [
      { front: 'Was ist Natrium? 🧂', back: 'Ein Alkalimetall — Na.' },
    ]);
    assertRoundTrip({ name: 'Edge', tags: [] }, [
      { front: 'Empty back', back: '' },
      { front: 'Rule in back', back: 'One\n---\nTwo' },
      { front: 'Multi\n\nline front', back: '' },
      { front: 'Fence in back', back: '```md\n## not a card\n---\n```' },
      { front: 'Tilde fence', back: '~~~\n```\n## nope\n~~~' },
    ]);
  });

  it('gives back the meta and cards for many generated decks', () => {
    const fronts = [
      'What is the capital of France?',
      'Symbol for sodium',
      'Water molecule\n\n```mermaid\ngraph LR\n  H --- O --- H2\n```',
      'Periodic table\n\n![Table](asset:a_1)\n\nWhich group is shaded?',
      'Ünïcødé 化学 ✓',
      'Code\n\n```\n---\n## inside\n```',
    ];
    const backs = [
      '',
      'Paris',
      '**Na**, from the Latin _natrium_.',
      'First paragraph.\n\nSecond paragraph.',
      'Above\n\n---\n\nBelow',
      '---',
      '- Lithium\n- Sodium\n  - Potassium',
      '```js\nconst x = 1;\n---\n## not a card\n```',
      '~~~~\n```\n---\n```\n~~~~\nAfter the fence\n***',
      '> Quote\n\n1. One\n2. Two',
      'Ends with a rule\n\n---',
    ];
    const random = rng(2026);
    /** @param {readonly string[]} items */
    const pick = (items) => items[Math.floor(random() * items.length)];
    for (let run = 0; run < 60; run++) {
      const count = 1 + Math.floor(random() * 6);
      const cards = Array.from({ length: count }, (_, index) => {
        const [first, ...rest] = pick(fronts).split('\n');
        return { front: [`${first} ${run}.${index}`, ...rest].join('\n'), back: pick(backs) };
      });
      const tags = random() < 0.5 ? [] : ['chemistry', 'geography'].slice(0, 1 + (run % 2));
      /** @type {DeckMeta} */
      const meta = { name: `Generated / Deck ${run}`, tags };
      if (run % 3 === 0) meta.description = `Run ${run}`;
      assertRoundTrip(meta, cards);
    }
  });

  it('reaches a fixed point after parsing a hand-written deck once', () => {
    const source = deck([
      '# Chemistry',
      '## Na <-> Sodium',
      '## Water',
      'Diagram:',
      '---',
      'H2O',
      '---',
      'Two hydrogens.',
      '## Empty',
    ]);
    const first = parseDeck(source);
    const second = parseDeck(serializeDeck(first.meta, pairs(first)));
    assert.deepEqual(second.meta, first.meta);
    assert.deepEqual(pairs(second), pairs(first));
  });
});
