// @ts-check
/**
 * Shared data shapes. Every layer imports these with
 * `@typedef {import('../core/types.js').Card} Card` instead of redefining them.
 * Times are epoch milliseconds. Intervals are whole days.
 */

/** @typedef {'again' | 'hard' | 'good' | 'easy'} Rating */

/**
 * @typedef {object} DeckMeta
 * @property {string} name Display name; `/` separates group levels ("Science / Chemistry").
 * @property {string[]} tags
 * @property {string} [description]
 */

/**
 * @typedef {object} ParsedCard
 * @property {string} front Markdown.
 * @property {string} back Markdown.
 * @property {number} line 1-based line of the card's `##` heading in the source.
 */

/**
 * @typedef {object} ParseProblem
 * @property {number} line 1-based; 0 when the problem is not tied to a line.
 * @property {string} message Plain words a user can act on.
 */

/**
 * @typedef {object} ParsedDeck
 * @property {DeckMeta} meta
 * @property {ParsedCard[]} cards
 * @property {ParseProblem[]} errors Problems that dropped content (a card was skipped, no name).
 * @property {ParseProblem[]} warnings Problems that did not (an empty back, a duplicate front).
 */

/**
 * @typedef {object} Deck
 * @property {string} id From `deckId(meta.name)`.
 * @property {string} name
 * @property {string[]} tags
 * @property {string} [description]
 * @property {number} importedAt First import.
 * @property {number} updatedAt Last import.
 */

/**
 * @typedef {object} Card
 * @property {string} id From `cardId(deckId, front)`.
 * @property {string} deckId
 * @property {string} front Markdown, with relative image paths rewritten to `asset:<id>`.
 * @property {string} back Markdown, same rewriting.
 * @property {number} position 0-based order in the deck file.
 */

/**
 * Scheduling state of one card. A card with no stored state is new.
 * @typedef {object} ReviewState
 * @property {string} cardId
 * @property {number} due When the card is next due.
 * @property {number} interval Days; 0 while relearning after "again".
 * @property {number} ease SM-2 ease factor, at least 1.3. Starts at 2.5.
 * @property {number} reps Consecutive successful reviews; 0 after "again".
 * @property {number} lapses Times a learned card was forgotten.
 * @property {number | null} lastReviewed
 * @property {boolean} suspended Suspended cards are never queued.
 */

/**
 * @typedef {object} ReviewLogEntry
 * @property {string} cardId
 * @property {Rating} rating
 * @property {number} at
 * @property {boolean} wasNew True when the card had no state before this review.
 */

/**
 * An image imported with a deck. `data` is a Blob in the browser and in Node 20+.
 * @typedef {object} Asset
 * @property {string} id From `assetId(deckId, path)`.
 * @property {string} deckId
 * @property {string} path The path as written in the deck, normalised (see `normalizeAssetPath`).
 * @property {string} type MIME type, `image/*`.
 * @property {Blob} data
 */

/**
 * @typedef {object} Settings
 * @property {number} newPerDay New cards introduced per day across all decks.
 * @property {'system' | 'light' | 'dark'} theme
 * @property {boolean} allowRemoteImages When false, `https:` images render as a blocked notice.
 */

/**
 * @typedef {object} DeckStats
 * @property {number} total
 * @property {number} due Cards with state whose `due` is at or before the cutoff.
 * @property {number} new Cards never reviewed (no state, or `lastReviewed: null`), not suspended.
 * @property {number} suspended
 */

/**
 * A scheduling algorithm. `sm2` in `scheduler.js` is the only one today.
 * @typedef {object} Scheduler
 * @property {string} id
 * @property {(cardId: string, now: number) => ReviewState} initialState
 * @property {(state: ReviewState, rating: Rating, now: number) => ReviewState} review
 * @property {(state: ReviewState, now: number) => Record<Rating, number>} preview
 *   Milliseconds from `now` until due, per rating.
 */

/**
 * One selected file or pasted text offered to an import.
 * @typedef {{ kind: 'deck', name: string, text: string }
 *   | { kind: 'image', name: string, type: string, data: Blob }} ImportSource
 */

/**
 * What an import would do, computed without writing anything.
 * @typedef {object} ImportPreview
 * @property {string} sourceName File name, or "Pasted text".
 * @property {string} deckId
 * @property {DeckMeta} meta
 * @property {boolean} isNew True when no deck with this id is stored.
 * @property {Card[]} cards Incoming cards, image refs rewritten to `asset:` ids.
 * @property {import('./merge.js').CardDiff} diff Against the stored cards.
 * @property {Asset[]} assets Images matched to this deck's refs.
 * @property {string[]} missingImages Relative refs with no matching file.
 * @property {ParseProblem[]} errors
 * @property {ParseProblem[]} warnings
 * @property {boolean} hasDiagrams True when any card has a mermaid block.
 */

/**
 * An in-progress review. Immutable: `StudyService.rate` returns a new one.
 * The current card is `cards.get(queue[0])`; the session is over when `queue` is empty.
 * @typedef {object} ReviewSession
 * @property {string[]} queue Card ids still to show.
 * @property {Map<string, Card>} cards Every card that can appear in this session.
 * @property {Map<string, ReviewState>} states Latest state per card id.
 * @property {number} reviewed Ratings given so far.
 * @property {Record<Rating, number>} tally Ratings given so far, per rating.
 */

/**
 * An in-progress practice run. It never changes scheduling.
 * @typedef {object} PracticeSession
 * @property {string[]} queue Card ids still to show.
 * @property {Map<string, Card>} cards
 * @property {string[]} missed Ids marked wrong in this round.
 * @property {number} correct
 */

export {};
