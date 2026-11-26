// @ts-check
import { h } from '../dom.js';
import { renderCardFace } from './card-face.js';

/** @typedef {import('../../core/types.js').Card} Card */
/** @typedef {import('../context.js').AppContext} AppContext */

let rowCounter = 0;

/**
 * @typedef {object} CardRowOptions
 * @property {Node} [label] Shown above the front, such as the deck name in search results.
 * @property {Node[]} [footer] Extra items in the row's footer, before the toggle.
 */

/**
 * A card in a list: its front, and its back revealed inline by tapping the front
 * or the "Show answer" button.
 * @param {Card} card
 * @param {AppContext} ctx
 * @param {CardRowOptions} [options]
 * @returns {{ el: HTMLLIElement, cleanup: () => void }}
 */
export function cardRow(card, ctx, { label, footer = [] } = {}) {
  const faceOptions = {
    allowRemoteImages: ctx.getSettings().allowRemoteImages,
    getAsset: ctx.getAsset,
  };
  const backId = `card-back-${++rowCounter}`;
  const front = h('div', { class: 'card-row-face' });
  const back = h('div', { class: 'card-row-face' });
  const backWrap = h(
    'div',
    { class: 'card-row-back', attrs: { id: backId, hidden: true } },
    h('p', { class: 'card-row-label' }, 'Back'),
    back,
  );
  /** @type {(() => void)[]} */
  const cleanups = [renderCardFace(front, card.front, faceOptions)];
  let backDrawn = false;
  let isOpen = false;

  const toggle = h(
    'button',
    {
      class: 'btn btn-ghost btn-compact',
      attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': backId },
      on: { click: () => setOpen(!isOpen) },
    },
    'Show answer',
  );

  /** @param {boolean} open */
  function setOpen(open) {
    if (open && !backDrawn) {
      cleanups.push(renderCardFace(back, card.back, faceOptions));
      backDrawn = true;
    }
    isOpen = open;
    backWrap.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide answer' : 'Show answer';
  }

  const frontWrap = h(
    'div',
    {
      class: 'card-row-front',
      on: {
        click: (event) => {
          const target = /** @type {Element} */ (event.target);
          if (target.closest('a') || window.getSelection()?.toString()) return;
          setOpen(!isOpen);
        },
      },
    },
    label,
    front,
  );

  const el = h(
    'li',
    { class: 'card-row' },
    frontWrap,
    backWrap,
    h('div', { class: 'card-row-footer' }, ...footer, toggle),
  );
  return {
    el,
    cleanup() {
      for (const cleanup of cleanups) cleanup();
    },
  };
}
