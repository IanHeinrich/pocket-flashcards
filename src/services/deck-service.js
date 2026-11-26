// @ts-check
import {
  findImageRefs,
  matchAssetFile,
  normalizeAssetPath,
  restoreImageRefs,
  rewriteImageRefs,
} from '../core/assets.js';
import { parseDeck, serializeDeck } from '../core/deck-format.js';
import { assetId, cardId, deckId } from '../core/ids.js';
import { markFencedLines, openingFence } from '../core/markdown.js';
import { diffCards } from '../core/merge.js';
import { searchCards } from '../core/search.js';
import { deckStats } from '../core/session.js';

/** @typedef {import('./clock.js').Clock} Clock */
/** @typedef {import('./storage/storage.js').Storage} Storage */
/** @typedef {import('../core/types.js').Asset} Asset */
/** @typedef {import('../core/types.js').Card} Card */
/** @typedef {import('../core/types.js').Deck} Deck */
/** @typedef {import('../core/types.js').DeckMeta} DeckMeta */
/** @typedef {import('../core/types.js').DeckStats} DeckStats */
/** @typedef {import('../core/types.js').ImportPreview} ImportPreview */
/** @typedef {import('../core/types.js').ImportSource} ImportSource */
/** @typedef {import('../core/types.js').ParseProblem} ParseProblem */
/** @typedef {import('../core/types.js').ReviewState} ReviewState */
/** @typedef {Extract<ImportSource, { kind: 'deck' }>} DeckSource */
/** @typedef {Extract<ImportSource, { kind: 'image' }>} ImageSource */

/**
 * @typedef {object} ImportResult
 * @property {number} added
 * @property {number} updated
 * @property {number} removed
 * @property {number} unchanged
 */

/** The name of an import source that was pasted rather than chosen as a file. */
export const PASTED_TEXT = 'Pasted text';

/** The image types an import or a backup accepts. */
export const SUPPORTED_IMAGE_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

/**
 * @param {string} type A MIME type.
 * @returns {boolean} True when the type is one of `SUPPORTED_IMAGE_TYPES`.
 */
export function isSupportedImageType(type) {
  return SUPPORTED_IMAGE_TYPES.includes(type);
}

/**
 * Orders cards by deck name, then by position in the deck: the order decks are studied in.
 * Cards whose deck is not in `decks` are left out.
 * @param {readonly Card[]} cards
 * @param {readonly Deck[]} decks
 * @returns {Card[]}
 */
export function orderCards(cards, decks) {
  const names = new Map(decks.map((deck) => [deck.id, deck.name]));
  return cards
    .filter((card) => names.has(card.deckId))
    .sort(
      (a, b) =>
        String(names.get(a.deckId)).localeCompare(String(names.get(b.deckId))) ||
        a.position - b.position,
    );
}

export class DeckService {
  /** @type {Storage} */
  #storage;
  /** @type {Clock} */
  #clock;

  /**
   * @param {Storage} storage
   * @param {Clock} clock
   */
  constructor(storage, clock) {
    this.#storage = storage;
    this.#clock = clock;
  }

  /**
   * Every deck with its counts, sorted by name.
   * @returns {Promise<{ deck: Deck, stats: DeckStats }[]>}
   */
  async listDecks() {
    const [decks, cards, states] = await Promise.all([
      this.#storage.getDecks(),
      this.#storage.getCards(),
      this.#loadStates(),
    ]);
    const cutoff = this.#clock.endOfDay(this.#clock.now());
    /** @type {Map<string, Card[]>} */
    const byDeck = new Map(decks.map((deck) => [deck.id, []]));
    for (const card of cards) byDeck.get(card.deckId)?.push(card);
    return decks
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((deck) => ({ deck, stats: deckStats(byDeck.get(deck.id) ?? [], states, cutoff) }));
  }

  /**
   * One deck with its cards in deck order and their states.
   * @param {string} id
   * @returns {Promise<{ deck: Deck, cards: Card[], states: Map<string, ReviewState> } | null>}
   */
  async getDeck(id) {
    const deck = await this.#storage.getDeck(id);
    if (!deck) return null;
    const [cards, allStates] = await Promise.all([this.#storage.getCards(id), this.#loadStates()]);
    cards.sort((a, b) => a.position - b.position);
    /** @type {Map<string, ReviewState>} */
    const states = new Map();
    for (const card of cards) {
      const state = allStates.get(card.id);
      if (state) states.set(card.id, state);
    }
    return { deck, cards, states };
  }

  /**
   * Works out what importing the sources would do, without writing anything.
   * Every image source of a supported type is offered to every deck source; each other
   * image source is skipped with a warning on every deck.
   * @param {readonly ImportSource[]} sources
   * @returns {Promise<ImportPreview[]>}
   */
  async previewImport(sources) {
    /** @type {ImageSource[]} */
    const images = [];
    /** @type {ParseProblem[]} */
    const imageWarnings = [];
    for (const source of sources) {
      if (source.kind !== 'image') continue;
      if (isSupportedImageType(source.type)) images.push(source);
      else {
        imageWarnings.push({
          line: 0,
          message: `${source.name} is not a supported image type, so it was skipped. Use PNG, JPEG, GIF, WebP or SVG images.`,
        });
      }
    }
    /** @type {Map<string, string>} deck id to the source that first named it */
    const seen = new Map();
    /** @type {ImportPreview[]} */
    const previews = [];
    for (const source of sources) {
      if (source.kind !== 'deck') continue;
      const preview = await this.#previewDeck(source, images, imageWarnings);
      const first = preview.deckId ? seen.get(preview.deckId) : undefined;
      if (first !== undefined) {
        previews.push(skippedPreview(preview, first));
        continue;
      }
      if (preview.deckId) seen.set(preview.deckId, source.name);
      previews.push(preview);
    }
    return previews;
  }

  /**
   * Writes a preview in one step: the deck, its new and changed cards and its images.
   * Cards missing from the import are deleted only with `removeMissing`. The deck's
   * images that no remaining card refers to are deleted.
   * @param {ImportPreview} preview
   * @param {{ removeMissing?: boolean }} [options]
   * @returns {Promise<ImportResult>}
   */
  async commitImport(preview, { removeMissing = false } = {}) {
    if (preview.cards.length === 0) {
      throw new Error(
        `"${preview.sourceName}" has no cards to import. Fix the problems listed and try again.`,
      );
    }
    const now = this.#clock.now();
    const [existing, storedCards, storedAssets] = await Promise.all([
      this.#storage.getDeck(preview.deckId),
      this.#storage.getCards(preview.deckId),
      this.#storage.getAssets(preview.deckId),
    ]);
    const putCards = [...preview.diff.added, ...preview.diff.updated];
    const deleteCardIds = removeMissing ? preview.diff.removed.map((card) => card.id) : [];
    /** @type {Map<string, Card>} */
    const remaining = new Map(storedCards.map((card) => [card.id, card]));
    for (const id of deleteCardIds) remaining.delete(id);
    for (const card of putCards) remaining.set(card.id, card);
    const used = [...remaining.values()].map((card) => `${card.front}\n${card.back}`).join('\n');
    await this.#storage.applyImport({
      deck: {
        id: preview.deckId,
        ...copyMeta(preview.meta),
        importedAt: existing?.importedAt ?? now,
        updatedAt: now,
      },
      putCards,
      deleteCardIds,
      putAssets: preview.assets,
      deleteAssetIds: storedAssets
        .filter((asset) => !used.includes(`(asset:${asset.id})`))
        .map((asset) => asset.id),
    });
    return {
      added: preview.diff.added.length,
      updated: preview.diff.updated.length,
      removed: removeMissing ? preview.diff.removed.length : 0,
      unchanged: preview.diff.unchanged.length,
    };
  }

  /**
   * The deck as a Markdown deck file, with its images pointing at their original paths.
   * @param {string} id
   * @returns {Promise<string>}
   */
  async exportDeck(id) {
    const deck = await this.#storage.getDeck(id);
    if (!deck) throw new Error('This deck no longer exists, so it cannot be exported.');
    const [cards, assets] = await Promise.all([
      this.#storage.getCards(id),
      this.#storage.getAssets(id),
    ]);
    const paths = new Map(assets.map((asset) => [asset.id, asset.path]));
    const sides = cards
      .sort((a, b) => a.position - b.position)
      .map((card) => ({
        front: restoreImageRefs(card.front, paths),
        back: restoreImageRefs(card.back, paths),
      }));
    return serializeDeck(copyMeta(deck), sides);
  }

  /**
   * Deletes a deck with its cards, their progress and its images.
   * @param {string} id
   * @returns {Promise<void>}
   */
  deleteDeck(id) {
    return this.#storage.deleteDeck(id);
  }

  /**
   * Cards in every deck that contain every term of the query, in deck order.
   * @param {string} query
   * @returns {Promise<{ card: Card, deck: Deck }[]>}
   */
  async search(query) {
    const [decks, cards] = await Promise.all([this.#storage.getDecks(), this.#storage.getCards()]);
    const byId = new Map(decks.map((deck) => [deck.id, deck]));
    return searchCards(orderCards(cards, decks), query).map((card) => ({
      card,
      deck: /** @type {Deck} */ (byId.get(card.deckId)),
    }));
  }

  /**
   * @param {DeckSource} source
   * @param {readonly ImageSource[]} images
   * @param {readonly ParseProblem[]} imageWarnings
   * @returns {Promise<ImportPreview>}
   */
  async #previewDeck(source, images, imageWarnings) {
    const parsed = parseDeck(source.text, {
      fallbackName: source.name === PASTED_TEXT ? undefined : source.name,
    });
    const base = {
      sourceName: source.name,
      meta: parsed.meta,
      errors: parsed.errors,
      warnings: [...parsed.warnings, ...imageWarnings],
    };
    if (!parsed.meta.name) {
      return { ...base, ...emptyContent(), deckId: '', isNew: true, hasDiagrams: false };
    }
    const id = deckId(parsed.meta.name);
    const [existing, storedCards, storedAssets] = await Promise.all([
      this.#storage.getDeck(id),
      this.#storage.getCards(id),
      this.#storage.getAssets(id),
    ]);
    const storedAssetIds = new Set(storedAssets.map((asset) => asset.id));
    const { assets, refToAssetId, missingImages } = matchImages(
      id,
      parsed.cards,
      images,
      storedAssetIds,
    );
    /** @type {Card[]} */
    const cards = parsed.cards.map((card, position) => ({
      id: cardId(id, card.front),
      deckId: id,
      front: rewriteImageRefs(card.front, refToAssetId),
      back: rewriteImageRefs(card.back, refToAssetId),
      position,
    }));
    return {
      ...base,
      deckId: id,
      isNew: !existing,
      cards,
      diff: diffCards(storedCards, cards),
      assets,
      missingImages,
      hasDiagrams: parsed.cards.some((card) => hasDiagram(card.front) || hasDiagram(card.back)),
    };
  }

  /** @returns {Promise<Map<string, ReviewState>>} */
  async #loadStates() {
    const states = await this.#storage.getStates();
    return new Map(states.map((state) => [state.cardId, state]));
  }
}

/**
 * Finds the deck's relative image refs and the image sources they point to. A ref with
 * no image source keeps the deck's stored image for that path, if there is one.
 * @param {string} id The deck id.
 * @param {readonly { front: string, back: string }[]} cards
 * @param {readonly ImageSource[]} images
 * @param {ReadonlySet<string>} storedAssetIds The ids of the deck's stored images.
 * @returns {{ assets: Asset[], refToAssetId: Map<string, string>, missingImages: string[] }}
 */
function matchImages(id, cards, images, storedAssetIds) {
  const names = images.map((image) => image.name);
  const refs = new Set(cards.flatMap((card) => [card.front, card.back]).flatMap(findImageRefs));
  /** @type {Map<string, Asset>} */
  const assets = new Map();
  /** @type {Map<string, string>} */
  const refToAssetId = new Map();
  /** @type {string[]} */
  const missingImages = [];
  for (const ref of refs) {
    const name = matchAssetFile(ref, names);
    const image = name === null ? undefined : images.find((source) => source.name === name);
    if (!image) {
      const stored = assetId(id, ref);
      if (storedAssetIds.has(stored)) refToAssetId.set(ref, stored);
      else missingImages.push(ref);
      continue;
    }
    const asset = {
      id: assetId(id, ref),
      deckId: id,
      path: normalizeAssetPath(ref),
      type: image.type,
      data: image.data,
    };
    assets.set(asset.id, asset);
    refToAssetId.set(ref, asset.id);
  }
  return { assets: [...assets.values()], refToAssetId, missingImages };
}

/**
 * @param {string} markdown
 * @returns {boolean} True when the text has a fenced code block tagged `mermaid`.
 */
function hasDiagram(markdown) {
  const lines = markdown.split('\n');
  return lines.some(
    (line, index) => openingFence(line)?.info === 'mermaid' && !isInsideFence(lines, index),
  );
}

/**
 * @param {readonly string[]} lines
 * @param {number} index
 * @returns {boolean} True when a fenced code block opened before `lines[index]` is still open.
 */
function isInsideFence(lines, index) {
  return markFencedLines([...lines.slice(0, index), ''])[index];
}

/**
 * The part of a preview that is empty when the deck cannot be imported.
 * @returns {Pick<ImportPreview, 'cards' | 'diff' | 'assets' | 'missingImages'>}
 */
function emptyContent() {
  return {
    cards: [],
    diff: { added: [], updated: [], removed: [], unchanged: [] },
    assets: [],
    missingImages: [],
  };
}

/**
 * A preview for a source naming a deck that an earlier source in the same import named.
 * @param {ImportPreview} preview
 * @param {string} firstSource
 * @returns {ImportPreview}
 */
function skippedPreview(preview, firstSource) {
  return {
    ...preview,
    ...emptyContent(),
    errors: [],
    warnings: [
      {
        line: 0,
        message: `This is the same deck, "${preview.meta.name}", as "${firstSource}", so it was skipped. Import it on its own to use it instead.`,
      },
    ],
    hasDiagrams: false,
  };
}

/**
 * @param {DeckMeta} meta
 * @returns {DeckMeta}
 */
function copyMeta({ name, tags, description }) {
  /** @type {DeckMeta} */
  const meta = { name, tags: [...tags] };
  if (description) meta.description = description;
  return meta;
}
