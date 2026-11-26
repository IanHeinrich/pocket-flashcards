// @ts-check
import { cardRow } from '../components/card-row.js';
import { h } from '../dom.js';
import { plural } from '../format.js';

/** @typedef {import('../context.js').AppContext} AppContext */

const DEBOUNCE_MS = 200;

/**
 * Search every card's front and back.
 * @param {HTMLElement} root
 * @param {AppContext} ctx
 * @returns {() => void}
 */
export function render(root, ctx) {
  const input = h('input', {
    class: 'input input-search',
    attrs: {
      id: 'search-input',
      type: 'search',
      placeholder: 'Search all cards',
      autocomplete: 'off',
      spellcheck: 'false',
      enterkeyhint: 'search',
    },
    on: { input: () => schedule() },
  });
  const status = h('p', { class: 'muted', attrs: { role: 'status' } });
  const results = h('ul', { class: 'card-list', attrs: { 'aria-label': 'Results' } });

  root.append(
    h(
      'section',
      { class: 'view' },
      h(
        'header',
        { class: 'view-header' },
        h('h1', null, 'Search'),
        h(
          'label',
          { class: 'visually-hidden', attrs: { for: 'search-input' } },
          'Search all cards',
        ),
        input,
      ),
      status,
      results,
    ),
  );

  /** @type {(() => void)[]} */
  let rowCleanups = [];
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let token = 0;

  function clearResults() {
    for (const cleanup of rowCleanups) cleanup();
    rowCleanups = [];
    results.replaceChildren();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), DEBOUNCE_MS);
  }

  async function run() {
    const query = input.value.trim();
    const current = ++token;
    if (query === '') {
      clearResults();
      status.textContent = 'Type a word or two to find cards in every deck.';
      return;
    }
    const found = await ctx.decks.search(query);
    if (current !== token) return;
    clearResults();
    status.textContent =
      found.length === 0 ? `No cards match “${query}”.` : plural(found.length, 'card');
    for (const { card, deck } of found) {
      const row = cardRow(card, ctx, { label: h('p', { class: 'result-deck' }, deck.name) });
      rowCleanups.push(row.cleanup);
      results.append(row.el);
    }
  }

  status.textContent = 'Type a word or two to find cards in every deck.';
  input.focus();

  return () => {
    clearTimeout(timer);
    token++;
    clearResults();
  };
}
