// @ts-check
import { normalizeDeckName } from '../../core/ids.js';
import { deckStats, isNew } from '../../core/session.js';
import { cardStatus } from '../card-status.js';
import { cardRow } from '../components/card-row.js';
import { confirmDialog } from '../components/confirm.js';
import { h } from '../dom.js';
import { deckFileName, downloadFile } from '../download.js';
import { plural } from '../format.js';
import { formatRoute } from '../router.js';

/** @typedef {import('../context.js').AppContext} AppContext */
/** @typedef {import('../../core/types.js').Card} Card */
/** @typedef {import('../../core/types.js').ReviewState} ReviewState */

const BADGE_CLASS = {
  suspended: 'badge badge-suspended',
  new: 'badge badge-new',
  due: 'badge badge-due',
  scheduled: 'badge',
};

/**
 * One deck: its details, actions and cards.
 * @param {HTMLElement} root
 * @param {AppContext} ctx
 * @param {{ deckId: string }} route
 * @returns {Promise<void | (() => void)>}
 */
export async function render(root, ctx, route) {
  const data = await ctx.decks.getDeck(route.deckId);
  if (!data) {
    root.append(notFound());
    return;
  }
  const { deck, cards } = data;
  let states = data.states;
  const parts = normalizeDeckName(deck.name).split(' / ');
  const title = parts[parts.length - 1];
  const group = parts.slice(0, -1).join(' / ');

  const statsList = h('dl', { class: 'stats' });
  const drawStats = () => {
    const stats = deckStats(cards, states, ctx.clock.endOfDay(ctx.clock.now()));
    statsList.replaceChildren(
      stat('Due', stats.due),
      stat('New', stats.new),
      stat('Cards', stats.total),
      stat('Suspended', stats.suspended),
    );
  };
  drawStats();

  /** @type {(() => void)[]} */
  const cleanups = [];
  /** @type {Map<string, () => void>} */
  const redrawRow = new Map();

  const refresh = async () => {
    const fresh = await ctx.decks.getDeck(deck.id);
    if (!fresh) return;
    states = fresh.states;
    drawStats();
    for (const redraw of redrawRow.values()) redraw();
  };

  const list = h(
    'ul',
    { class: 'card-list', attrs: { 'aria-label': 'Cards' } },
    cards.map((card, index) => {
      const badge = h('span', { class: 'badge' });
      const suspend = h('button', {
        class: 'btn btn-ghost btn-compact',
        attrs: { type: 'button' },
        on: {
          click: () => void act(ctx.study.setSuspended(card.id, !states.get(card.id)?.suspended)),
        },
      });
      const reset = h(
        'button',
        {
          class: 'btn btn-ghost btn-compact',
          attrs: { type: 'button', 'aria-label': `Reset progress of card ${index + 1}` },
          on: { click: () => void resetCard(card) },
        },
        'Reset',
      );
      const redraw = () => {
        const state = states.get(card.id);
        const now = ctx.clock.now();
        const status = cardStatus(state, now, ctx.clock.endOfDay(now));
        badge.className = BADGE_CLASS[status.kind];
        badge.textContent = status.label;
        suspend.textContent = state?.suspended ? 'Unsuspend' : 'Suspend';
        suspend.setAttribute(
          'aria-label',
          `${state?.suspended ? 'Unsuspend' : 'Suspend'} card ${index + 1}`,
        );
        reset.hidden = isNew(state);
      };
      redraw();
      redrawRow.set(card.id, redraw);
      const row = cardRow(card, ctx, { footer: [badge, suspend, reset] });
      cleanups.push(row.cleanup);
      return row.el;
    }),
  );

  /** @param {Promise<void>} action */
  async function act(action) {
    try {
      await action;
      await refresh();
    } catch (error) {
      ctx.toast(error instanceof Error ? error.message : String(error));
    }
  }

  /** @param {Card} card */
  async function resetCard(card) {
    const ok = await confirmDialog({
      title: 'Reset this card?',
      message: 'It becomes a new card again, and when it was next due is forgotten.',
      confirmLabel: 'Reset progress',
      danger: true,
    });
    if (ok) await act(ctx.study.resetCard(card.id));
  }

  async function exportDeck() {
    try {
      const text = await ctx.decks.exportDeck(deck.id);
      const fileName = deckFileName(deck.name, '.md');
      downloadFile(fileName, text, 'text/markdown');
      ctx.toast(`Saved ${fileName}.`);
    } catch (error) {
      ctx.toast(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteDeck() {
    const ok = await confirmDialog({
      title: `Delete “${deck.name}”?`,
      message: `This deletes the deck, its ${plural(cards.length, 'card')} and their progress from this device. You can import the file again, but the progress cannot be brought back.`,
      confirmLabel: 'Delete deck',
      danger: true,
    });
    if (!ok) return;
    await ctx.decks.deleteDeck(deck.id);
    ctx.toast(`Deleted “${deck.name}”.`);
    ctx.navigate('#/');
  }

  root.append(
    h(
      'section',
      { class: 'view' },
      h(
        'header',
        { class: 'view-header' },
        h(
          'div',
          { class: 'deck-title-group' },
          group && h('p', { class: 'breadcrumb' }, group),
          h('h1', null, title),
        ),
        deck.description && h('p', { class: 'deck-description' }, deck.description),
        deck.tags.length > 0 &&
          h(
            'ul',
            { class: 'tags', attrs: { 'aria-label': 'Tags' } },
            deck.tags.map((tag) => h('li', { class: 'tag' }, tag)),
          ),
      ),
      statsList,
      h(
        'div',
        { class: 'toolbar' },
        h(
          'a',
          {
            class: 'btn btn-primary',
            attrs: { href: formatRoute({ name: 'review', deckIds: [deck.id] }) },
          },
          'Review',
        ),
        h(
          'a',
          {
            class: 'btn',
            attrs: { href: formatRoute({ name: 'practice', deckIds: [deck.id], tag: null }) },
          },
          'Practice',
        ),
        h(
          'button',
          { class: 'btn', attrs: { type: 'button' }, on: { click: () => void exportDeck() } },
          'Export',
        ),
        h(
          'button',
          {
            class: 'btn btn-danger',
            attrs: { type: 'button' },
            on: { click: () => void deleteDeck() },
          },
          'Delete',
        ),
      ),
      h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title' }, plural(cards.length, 'card')),
        list,
      ),
    ),
  );

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

/**
 * @param {string} label
 * @param {number} value
 * @returns {HTMLElement}
 */
function stat(label, value) {
  return h('div', { class: 'stat' }, h('dt', null, label), h('dd', null, String(value)));
}

/** @returns {HTMLElement} */
function notFound() {
  return h(
    'section',
    { class: 'view' },
    h(
      'div',
      { class: 'empty-state' },
      h('h1', null, 'Deck not found'),
      h('p', null, 'It may have been deleted, or the link is from another device.'),
      h('a', { class: 'btn btn-primary', attrs: { href: '#/' } }, 'Back to decks'),
    ),
  );
}
