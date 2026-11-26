// @ts-check
import { groupDecks } from '../../core/deck-groups.js';
import { queueCounts } from '../card-status.js';
import { h } from '../dom.js';
import { fetchExampleSources } from '../examples.js';
import { describeQueue, plural } from '../format.js';
import { formatRoute } from '../router.js';
import { prefetchMermaid } from '../rich/mermaid.js';

/** @typedef {import('../context.js').AppContext} AppContext */
/** @typedef {import('../../core/types.js').Deck} Deck */
/** @typedef {import('../../core/types.js').DeckStats} DeckStats */
/** @typedef {import('../../core/deck-groups.js').DeckGroupNode} DeckGroupNode */

/**
 * The start page: every deck as a tree, with what is due.
 * @param {HTMLElement} root
 * @param {AppContext} ctx
 */
export async function render(root, ctx) {
  const list = await ctx.decks.listDecks();
  if (list.length === 0) {
    root.append(renderWelcome(ctx));
    return;
  }
  const review = await ctx.study.startReview(null);
  const ready = review.queue.length;
  const stats = new Map(list.map(({ deck, stats }) => [deck.id, stats]));
  const tree = groupDecks(list.map(({ deck }) => deck));

  root.append(
    h(
      'section',
      { class: 'view' },
      h(
        'header',
        { class: 'view-header' },
        h('h1', null, 'Decks'),
        h('p', { class: 'lede' }, plural(list.length, 'deck')),
      ),
      h(
        'div',
        { class: 'hero' },
        h(
          'p',
          { class: 'hero-text' },
          ready > 0
            ? describeQueue(queueCounts(review))
            : 'All caught up. Nothing is due right now.',
        ),
        h(
          'div',
          { class: 'row' },
          h(
            'a',
            {
              class: 'btn btn-primary btn-lg',
              attrs: {
                href: formatRoute({ name: 'review', deckIds: null }),
                'aria-disabled': ready === 0 ? 'true' : null,
              },
              on: {
                click: (event) => {
                  if (ready === 0) event.preventDefault();
                },
              },
            },
            'Review',
            h('span', { class: 'count' }, String(ready)),
          ),
          h(
            'a',
            {
              class: 'btn btn-lg',
              attrs: { href: formatRoute({ name: 'practice', deckIds: null, tag: null }) },
            },
            'Practice all',
          ),
        ),
      ),
      h(
        'ul',
        { class: 'deck-tree', attrs: { 'aria-label': 'Your decks' } },
        tree.map((node) => renderNode(node, stats)),
      ),
    ),
  );
}

/**
 * @param {DeckGroupNode} node
 * @param {Map<string, DeckStats>} stats
 * @returns {HTMLLIElement}
 */
function renderNode(node, stats) {
  const row = node.deck && deckRow(node.deck, node.name, stats.get(node.deck.id));
  if (node.children.length === 0) return h('li', null, row);
  return h(
    'li',
    { class: 'deck-group' },
    row || h('h2', { class: 'deck-group-title' }, node.name),
    h(
      'ul',
      { attrs: { 'aria-label': node.path } },
      node.children.map((child) => renderNode(child, stats)),
    ),
  );
}

/**
 * @param {Deck} deck
 * @param {string} label This tree level's part of the name.
 * @param {DeckStats | undefined} stats
 * @returns {HTMLElement}
 */
function deckRow(deck, label, stats) {
  return h(
    'div',
    { class: 'deck-row' },
    h(
      'a',
      { class: 'deck-row-link', attrs: { href: formatRoute({ name: 'deck', deckId: deck.id }) } },
      h('span', { class: 'deck-name' }, label),
      stats &&
        h(
          'span',
          { class: 'deck-counts' },
          stats.due > 0 && h('span', { class: 'badge badge-due' }, `${stats.due} due`),
          stats.new > 0 && h('span', { class: 'badge badge-new' }, `${stats.new} new`),
          h('span', { class: 'badge' }, plural(stats.total, 'card')),
        ),
    ),
    h(
      'div',
      { class: 'deck-actions' },
      h(
        'a',
        {
          class: 'btn btn-compact',
          attrs: {
            href: formatRoute({ name: 'review', deckIds: [deck.id] }),
            'aria-label': `Review ${deck.name}`,
          },
        },
        'Review',
      ),
      h(
        'a',
        {
          class: 'btn btn-ghost btn-compact',
          attrs: {
            href: formatRoute({ name: 'practice', deckIds: [deck.id], tag: null }),
            'aria-label': `Practice ${deck.name}`,
          },
        },
        'Practice',
      ),
    ),
  );
}

/**
 * The first-run page.
 * @param {AppContext} ctx
 * @returns {HTMLElement}
 */
function renderWelcome(ctx) {
  const load = h(
    'button',
    {
      class: 'btn btn-primary btn-lg',
      attrs: { type: 'button' },
      on: { click: () => void loadExamples(ctx, load) },
    },
    'Load example decks',
  );
  return h(
    'section',
    { class: 'view' },
    h(
      'div',
      { class: 'empty-state' },
      h('div', { class: 'empty-art', attrs: { 'aria-hidden': 'true' } }),
      h('h1', null, 'Welcome to Pocket Flashcards'),
      h(
        'p',
        null,
        'Flashcards written in plain Markdown, reviewed with spaced repetition, and kept on this ' +
          'device. No account, no cloud, and it works offline.',
      ),
      h(
        'div',
        { class: 'row' },
        load,
        h('a', { class: 'btn btn-lg', attrs: { href: '#/import' } }, 'Import a deck'),
      ),
      h(
        'p',
        { class: 'small' },
        'The examples include a short guide to the app, world capitals and chemistry basics.',
      ),
    ),
  );
}

/**
 * Imports the three example decks from this site.
 * @param {AppContext} ctx
 * @param {HTMLButtonElement} button
 */
async function loadExamples(ctx, button) {
  button.disabled = true;
  button.textContent = 'Loading…';
  try {
    const previews = await ctx.decks.previewImport(await fetchExampleSources());
    for (const preview of previews) await ctx.decks.commitImport(preview);
    ctx.afterImport();
    if (previews.some((preview) => preview.hasDiagrams)) void prefetchMermaid();
    ctx.toast(`Added ${plural(previews.length, 'example deck')}.`);
    ctx.navigate('#/');
  } catch (error) {
    console.error(error);
    ctx.toast(
      `The example decks could not be loaded. ${error instanceof Error ? error.message : ''}`,
    );
    button.disabled = false;
    button.textContent = 'Load example decks';
  }
}
