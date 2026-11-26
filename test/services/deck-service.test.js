// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../../src/core/deck-format.js';
import { cardId, deckId } from '../../src/core/ids.js';
import { sm2 } from '../../src/core/scheduler.js';
import { DeckService } from '../../src/services/deck-service.js';
import { MemoryStorage } from '../../src/services/storage/memory-storage.js';
import { StudyService } from '../../src/services/study-service.js';
import {
  CAPITALS_DECK,
  CHEMISTRY_DECK,
  deckSource,
  fixedClock,
  FIXED_NOW,
  DAY,
  imageSource,
  importDecks,
} from '../helpers.js';

const CAPITALS_ID = deckId('Geography / Capitals');
const CHEMISTRY_ID = deckId('Science / Chemistry');

const PERIODIC_DECK = `---
deck: Science / Periodic table
---

## Where is sodium in the periodic table?

![Table](images/periodic-table.png)

---

Group 1, period 3.

## Which group holds the noble gases?

Group 18. ![Gases](noble.png)

## How is a period drawn?

![Row](images/row.png)
`;

function setup(now = FIXED_NOW) {
  const storage = new MemoryStorage();
  return { storage, decks: new DeckService(storage, fixedClock(now)) };
}

/**
 * @param {DeckService} decks
 * @param {string} text
 */
async function previewOne(decks, text) {
  const [preview] = await decks.previewImport([deckSource('capitals.md', text)]);
  return preview;
}

describe('DeckService.previewImport', () => {
  it('previews a new deck without writing anything', async () => {
    const { storage, decks } = setup();
    const preview = await previewOne(decks, CAPITALS_DECK);
    assert.equal(preview.sourceName, 'capitals.md');
    assert.equal(preview.deckId, CAPITALS_ID);
    assert.equal(preview.isNew, true);
    assert.deepEqual(preview.meta, { name: 'Geography / Capitals', tags: ['geography'] });
    assert.deepEqual(preview.cards[1], {
      id: cardId(CAPITALS_ID, 'What is the capital of Spain?'),
      deckId: CAPITALS_ID,
      front: 'What is the capital of Spain?',
      back: 'Madrid',
      position: 1,
    });
    assert.equal(preview.diff.added.length, 3);
    assert.deepEqual(await storage.getDecks(), []);
    assert.deepEqual(await storage.getCards(), []);
  });

  it('counts added, updated, removed and unchanged cards on a re-import', async () => {
    const { decks } = setup();
    await importDecks(decks, deckSource('capitals.md', CAPITALS_DECK));
    const edited = CAPITALS_DECK.replace('Madrid', 'Madrid, on the Manzanares')
      .replace('## What is the capital of Italy?\n\nRome\n', '')
      .concat('\n## What is the capital of Portugal?\n\nLisbon\n');
    const preview = await previewOne(decks, edited);
    assert.equal(preview.isNew, false);
    assert.deepEqual(
      {
        added: preview.diff.added.map((card) => card.back),
        updated: preview.diff.updated.map((card) => card.back),
        removed: preview.diff.removed.map((card) => card.back),
        unchanged: preview.diff.unchanged.map((card) => card.back),
      },
      {
        added: ['Lisbon'],
        updated: ['Madrid, on the Manzanares'],
        removed: ['Rome'],
        unchanged: ['Paris'],
      },
    );
  });

  it('uses the file name when the deck names itself nowhere', async () => {
    const { decks } = setup();
    const [preview] = await decks.previewImport([
      deckSource('Ocean facts.md', '## Largest ocean?\n\nPacific\n'),
    ]);
    assert.equal(preview.meta.name, 'Ocean facts');
    assert.equal(preview.errors.length, 0);
  });

  it('returns an empty preview with the errors for pasted text with no deck name', async () => {
    const { decks } = setup();
    const [preview] = await decks.previewImport([
      deckSource('Pasted text', '## Largest ocean?\n\nPacific\n'),
    ]);
    assert.equal(preview.sourceName, 'Pasted text');
    assert.equal(preview.deckId, '');
    assert.deepEqual(preview.cards, []);
    assert.deepEqual(preview.errors, parseDeck('## Largest ocean?\n\nPacific\n').errors);
  });

  it('matches images by path, then by file name, and reports the missing ones', async () => {
    const { decks } = setup();
    const [preview] = await decks.previewImport([
      deckSource('periodic.md', PERIODIC_DECK),
      imageSource('periodic-table.png', 'table bytes'),
      imageSource('Noble.PNG', 'noble bytes'),
    ]);
    const periodicId = deckId('Science / Periodic table');
    assert.deepEqual(
      preview.assets.map(({ path, deckId: owner }) => ({ path, owner })),
      [
        { path: 'images/periodic-table.png', owner: periodicId },
        { path: 'noble.png', owner: periodicId },
      ],
    );
    assert.equal(await preview.assets[0].data.text(), 'table bytes');
    assert.deepEqual(preview.missingImages, ['images/row.png']);
    assert.match(
      preview.cards[0].front,
      new RegExp(`!\\[Table\\]\\(asset:${preview.assets[0].id}\\)`),
    );
    assert.match(preview.cards[2].back, /!\[Row\]\(images\/row\.png\)/);
  });

  it('keeps the card id from the front as written, before images are rewritten', async () => {
    const { decks } = setup();
    const [preview] = await decks.previewImport([
      deckSource('periodic.md', PERIODIC_DECK),
      imageSource('periodic-table.png'),
    ]);
    const front = parseDeck(PERIODIC_DECK).cards[0].front;
    assert.equal(preview.cards[0].id, cardId(preview.deckId, front));
  });

  it('offers every image to every deck in the same import', async () => {
    const { decks } = setup();
    const other = PERIODIC_DECK.replace('Periodic table', 'Elements');
    const previews = await decks.previewImport([
      deckSource('periodic.md', PERIODIC_DECK),
      imageSource('noble.png'),
      deckSource('elements.md', other),
    ]);
    assert.deepEqual(
      previews.map((preview) => preview.assets.map((asset) => asset.path)),
      [['noble.png'], ['noble.png']],
    );
    assert.notEqual(previews[0].assets[0].id, previews[1].assets[0].id);
  });

  it('skips a second source for the same deck, with a warning', async () => {
    const { decks } = setup();
    const previews = await decks.previewImport([
      deckSource('capitals.md', CAPITALS_DECK),
      deckSource('capitals copy.md', CAPITALS_DECK),
    ]);
    assert.equal(previews.length, 2);
    assert.equal(previews[0].cards.length, 3);
    assert.deepEqual(previews[1].cards, []);
    assert.deepEqual(previews[1].diff.added, []);
    assert.equal(previews[1].warnings.length, 1);
    assert.match(previews[1].warnings[0].message, /same deck.*"capitals\.md".*skipped/);
  });

  it('refuses to commit a skipped duplicate, leaving the stored deck as it was', async () => {
    const { decks } = setup();
    await importDecks(decks, deckSource('capitals.md', CAPITALS_DECK));
    const renamed = CAPITALS_DECK.replace(/^tags:.*$/m, 'tags: [changed]');
    const [, skipped] = await decks.previewImport([
      deckSource('capitals.md', CAPITALS_DECK),
      deckSource('capitals copy.md', renamed),
    ]);
    await assert.rejects(decks.commitImport(skipped), /has no cards to import/);
    const [{ deck }] = await decks.listDecks();
    assert.notDeepEqual(deck.tags, ['changed']);
  });

  it('notices mermaid diagrams on a front or a back', async () => {
    const { decks } = setup();
    const withDiagram = `${CHEMISTRY_DECK}\n## Water molecule\n\n\`\`\`mermaid\ngraph LR\n  H1 --- O --- H2\n\`\`\`\n`;
    const withCode = `${CHEMISTRY_DECK}\n## Code\n\n\`\`\`js\nconst mermaid = 1;\n\`\`\`\n`;
    const [diagram, code] = await decks.previewImport([
      deckSource('a.md', withDiagram),
      deckSource('b.md', withCode.replace('Science / Chemistry', 'Science / Code')),
    ]);
    assert.equal(diagram.hasDiagrams, true);
    assert.equal(code.hasDiagrams, false);
  });

  it('does not count a mermaid fence shown inside another code block', async () => {
    const { decks } = setup();
    const shown = `${CHEMISTRY_DECK}\n## Fence example\n\n~~~\n\`\`\`mermaid\ngraph LR\n\`\`\`\n~~~\n`;
    const preview = await previewOne(decks, shown);
    assert.equal(preview.hasDiagrams, false);
  });

  it('skips an image of an unsupported type, with a warning', async () => {
    const { decks } = setup();
    const [preview] = await decks.previewImport([
      deckSource('periodic.md', PERIODIC_DECK),
      imageSource('noble.bmp', 'noble bytes', 'image/bmp'),
      imageSource('row.png'),
    ]);
    assert.deepEqual(
      preview.assets.map((asset) => asset.path),
      ['images/row.png'],
    );
    assert.deepEqual(preview.missingImages, ['images/periodic-table.png', 'noble.png']);
    assert.equal(preview.warnings.length, 1);
    assert.match(preview.warnings[0].message, /^noble\.bmp is not a supported image type/);
  });

  it('carries the parser’s warnings', async () => {
    const { decks } = setup();
    const preview = await previewOne(
      decks,
      `${CAPITALS_DECK}\n## What is the capital of France?\n\nParis again\n`,
    );
    assert.equal(preview.cards.length, 3);
    assert.equal(preview.warnings.length, 1);
  });
});

describe('DeckService.commitImport', () => {
  it('writes nothing when the import cannot be saved', async () => {
    const { storage, decks } = setup();
    await importDecks(decks, deckSource('periodic.md', PERIODIC_DECK), imageSource('noble.png'));
    const before = {
      decks: await storage.getDecks(),
      cards: await storage.getCards(),
      assets: await storage.getAssets(),
    };
    const full = new DOMException('The storage is full.', 'QuotaExceededError');
    storage.applyImport = async () => {
      throw full;
    };
    const edited = PERIODIC_DECK.replace(' ![Gases](noble.png)', '').concat(
      '\n## Which element is lightest?\n\nHydrogen\n',
    );
    const preview = await previewOne(decks, edited);
    await assert.rejects(decks.commitImport(preview, { removeMissing: true }), (e) => e === full);
    assert.deepEqual(
      {
        decks: await storage.getDecks(),
        cards: await storage.getCards(),
        assets: await storage.getAssets(),
      },
      before,
    );
  });

  it('stores a new deck and its cards and reports the counts', async () => {
    const { storage, decks } = setup();
    const preview = await previewOne(decks, CAPITALS_DECK);
    const result = await decks.commitImport(preview);
    assert.deepEqual(result, { added: 3, updated: 0, removed: 0, unchanged: 0 });
    assert.deepEqual(await storage.getDeck(CAPITALS_ID), {
      id: CAPITALS_ID,
      name: 'Geography / Capitals',
      tags: ['geography'],
      importedAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
    assert.equal((await storage.getCards(CAPITALS_ID)).length, 3);
  });

  it('refuses a new deck with no cards', async () => {
    const { storage, decks } = setup();
    const [preview] = await decks.previewImport([deckSource('Pasted text', 'No cards here.')]);
    await assert.rejects(decks.commitImport(preview), /"Pasted text" has no cards to import/);
    assert.deepEqual(await storage.getDecks(), []);
  });

  it('keeps cards missing from a re-import unless asked to remove them', async () => {
    const { storage, decks } = setup();
    await importDecks(decks, deckSource('capitals.md', CAPITALS_DECK));
    const shorter = CAPITALS_DECK.replace('## What is the capital of Italy?\n\nRome\n', '');

    const kept = await decks.commitImport(await previewOne(decks, shorter));
    assert.deepEqual(kept, { added: 0, updated: 0, removed: 0, unchanged: 2 });
    assert.equal((await storage.getCards(CAPITALS_ID)).length, 3);

    const removed = await decks.commitImport(await previewOne(decks, shorter), {
      removeMissing: true,
    });
    assert.deepEqual(removed, { added: 0, updated: 0, removed: 1, unchanged: 2 });
    assert.deepEqual((await storage.getCards(CAPITALS_ID)).map((card) => card.back).sort(), [
      'Madrid',
      'Paris',
    ]);
  });

  it('keeps the first import date and the review progress of a card with an edited back', async () => {
    const storage = new MemoryStorage();
    await importDecks(
      new DeckService(storage, fixedClock()),
      deckSource('capitals.md', CAPITALS_DECK),
    );
    const study = new StudyService(storage, sm2, fixedClock());
    const session = await study.startReview(null);
    await study.rate(session, 'good');
    const [reviewed] = await storage.getStates();

    const later = new DeckService(storage, fixedClock(FIXED_NOW + DAY));
    const edited = CAPITALS_DECK.replace('Paris', 'Paris, on the Seine');
    const result = await later.commitImport(await previewOne(later, edited));

    assert.equal(result.updated, 1);
    assert.deepEqual(await storage.getStates(), [reviewed]);
    const deck = await storage.getDeck(CAPITALS_ID);
    assert.equal(deck?.importedAt, FIXED_NOW);
    assert.equal(deck?.updatedAt, FIXED_NOW + DAY);
    assert.equal((await later.getDeck(CAPITALS_ID))?.cards[0].back, 'Paris, on the Seine');
  });

  it('stores matched images and deletes the ones no card refers to any more', async () => {
    const { storage, decks } = setup();
    await importDecks(
      decks,
      deckSource('periodic.md', PERIODIC_DECK),
      imageSource('periodic-table.png'),
      imageSource('noble.png'),
    );
    const periodicId = deckId('Science / Periodic table');
    assert.equal((await storage.getAssets(periodicId)).length, 2);

    const withoutNoble = PERIODIC_DECK.replace(' ![Gases](noble.png)', '');
    await importDecks(
      decks,
      deckSource('periodic.md', withoutNoble),
      imageSource('periodic-table.png'),
    );
    assert.deepEqual(
      (await storage.getAssets(periodicId)).map((asset) => asset.path),
      ['images/periodic-table.png'],
    );
  });

  it('keeps the images of cards it keeps, even when the import leaves them out', async () => {
    const { storage, decks } = setup();
    await importDecks(decks, deckSource('periodic.md', PERIODIC_DECK), imageSource('noble.png'));
    const periodicId = deckId('Science / Periodic table');
    const onlyFirst = PERIODIC_DECK.split('## Which group')[0];
    await importDecks(decks, deckSource('periodic.md', onlyFirst));
    assert.deepEqual(
      (await storage.getAssets(periodicId)).map((asset) => asset.path),
      ['noble.png'],
    );
  });

  it('deletes the images of the cards it removes', async () => {
    const { storage, decks } = setup();
    await importDecks(decks, deckSource('periodic.md', PERIODIC_DECK), imageSource('noble.png'));
    const periodicId = deckId('Science / Periodic table');
    const onlyFirst = PERIODIC_DECK.split('## Which group')[0];
    await decks.commitImport(await previewOne(decks, onlyFirst), { removeMissing: true });
    assert.deepEqual(await storage.getAssets(periodicId), []);
  });

  it('keeps the stored images when the deck file is imported again without them', async () => {
    const { storage, decks } = setup();
    await importDecks(
      decks,
      deckSource('periodic.md', PERIODIC_DECK),
      imageSource('periodic-table.png'),
      imageSource('noble.png'),
      imageSource('row.png'),
    );
    const periodicId = deckId('Science / Periodic table');
    const cardsBefore = await storage.getCards(periodicId);
    const assetsBefore = await storage.getAssets(periodicId);

    const preview = await previewOne(decks, PERIODIC_DECK);
    assert.deepEqual(preview.missingImages, []);
    assert.equal(preview.diff.unchanged.length, 3);
    await decks.commitImport(preview);

    assert.deepEqual(await storage.getCards(periodicId), cardsBefore);
    assert.deepEqual(
      (await storage.getAssets(periodicId)).map((asset) => asset.id),
      assetsBefore.map((asset) => asset.id),
    );
  });
});

describe('DeckService reading', () => {
  it('lists decks by name with their counts for today', async () => {
    const { storage, decks } = setup();
    await importDecks(
      decks,
      deckSource('chemistry.md', CHEMISTRY_DECK),
      deckSource('capitals.md', CAPITALS_DECK),
    );
    const [sodium] = await storage.getCards(CHEMISTRY_ID);
    await storage.putState({
      ...sm2.initialState(sodium.id, FIXED_NOW),
      lastReviewed: FIXED_NOW - DAY,
      due: FIXED_NOW + 10 * 60 * 60 * 1000,
    });
    const list = await decks.listDecks();
    assert.deepEqual(
      list.map(({ deck, stats }) => ({ name: deck.name, stats })),
      [
        { name: 'Geography / Capitals', stats: { total: 3, due: 0, new: 3, suspended: 0 } },
        { name: 'Science / Chemistry', stats: { total: 2, due: 1, new: 1, suspended: 0 } },
      ],
    );
  });

  it('gets a deck with its cards in order and their states, or null', async () => {
    const { storage, decks } = setup();
    await importDecks(decks, deckSource('capitals.md', CAPITALS_DECK));
    const first = cardId(CAPITALS_ID, 'What is the capital of France?');
    await storage.putState(sm2.initialState(first, FIXED_NOW));
    const result = await decks.getDeck(CAPITALS_ID);
    assert.deepEqual(
      result?.cards.map((card) => card.position),
      [0, 1, 2],
    );
    assert.deepEqual([...(result?.states.keys() ?? [])], [first]);
    assert.equal(await decks.getDeck('d_unknown'), null);
  });

  it('exports a deck that imports back to the same cards, with image paths restored', async () => {
    const { decks } = setup();
    await importDecks(
      decks,
      deckSource('periodic.md', PERIODIC_DECK),
      imageSource('periodic-table.png'),
    );
    const periodicId = deckId('Science / Periodic table');
    const markdown = await decks.exportDeck(periodicId);
    assert.match(markdown, /!\[Table\]\(images\/periodic-table\.png\)/);
    assert.doesNotMatch(markdown, /asset:/);
    assert.deepEqual(
      parseDeck(markdown).cards.map(({ front, back }) => ({ front, back })),
      parseDeck(PERIODIC_DECK).cards.map(({ front, back }) => ({ front, back })),
    );
  });

  it('refuses to export a deck that does not exist', async () => {
    const { decks } = setup();
    await assert.rejects(decks.exportDeck('d_unknown'), /no longer exists/);
  });

  it('deletes a deck with its cards', async () => {
    const { storage, decks } = setup();
    await importDecks(decks, deckSource('capitals.md', CAPITALS_DECK));
    await decks.deleteDeck(CAPITALS_ID);
    assert.deepEqual(await decks.listDecks(), []);
    assert.deepEqual(await storage.getCards(), []);
  });

  it('searches every deck and says which deck each card is in', async () => {
    const { decks } = setup();
    await importDecks(
      decks,
      deckSource('capitals.md', CAPITALS_DECK),
      deckSource('chemistry.md', CHEMISTRY_DECK),
    );
    const results = await decks.search('symbol');
    assert.deepEqual(
      results.map(({ card, deck }) => [deck.name, card.back]),
      [
        ['Science / Chemistry', 'Na'],
        ['Science / Chemistry', 'Fe'],
      ],
    );
  });
});
