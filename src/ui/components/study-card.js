// @ts-check
import { h } from '../dom.js';
import { renderCardFace } from './card-face.js';

/** @typedef {import('../../core/types.js').Card} Card */
/** @typedef {import('../context.js').AppContext} AppContext */

/**
 * @typedef {object} StudyCard
 * @property {HTMLElement} el
 * @property {() => string} reveal Shows the back and returns its text, for announcing.
 * @property {() => void} cleanup
 */

/**
 * The card shown in review and practice: the front, and the back once revealed.
 * Tapping or clicking the card calls `onTap`, except on a link or other control inside it,
 * or when the click ends a text selection. The views' "Show answer" button stays the
 * keyboard and screen reader route.
 * @param {Card} card
 * @param {AppContext} ctx
 * @param {{ onTap: () => void }} options
 * @returns {StudyCard}
 */
export function studyCard(card, ctx, { onTap }) {
  const options = {
    allowRemoteImages: ctx.getSettings().allowRemoteImages,
    getAsset: ctx.getAsset,
  };
  const front = h('div', { class: 'card-front' });
  const divider = h('hr', { class: 'card-divider', attrs: { hidden: true } });
  const back = h('div', { class: 'card-back', attrs: { hidden: true } });
  const el = h(
    'article',
    { class: 'study-card', attrs: { 'aria-label': 'Card' } },
    h('h2', { class: 'visually-hidden' }, 'Front'),
    front,
    divider,
    back,
  );
  const cleanups = [renderCardFace(front, card.front, options)];
  /** @param {MouseEvent} event */
  const onClick = (event) => {
    const target = /** @type {Element} */ (event.target);
    if (target.closest?.('a, button, summary, input, select, textarea')) return;
    if (window.getSelection()?.toString()) return;
    onTap();
  };
  el.addEventListener('click', onClick);
  cleanups.push(() => el.removeEventListener('click', onClick));

  return {
    el,
    reveal() {
      if (back.hidden) {
        cleanups.push(renderCardFace(back, card.back, options));
        divider.hidden = false;
        back.hidden = false;
      }
      return back.textContent?.trim() || 'The back of this card is empty.';
    },
    cleanup() {
      for (const cleanup of cleanups) cleanup();
    },
  };
}
