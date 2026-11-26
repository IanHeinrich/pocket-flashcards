// @ts-check
import { RATINGS, ratingBar } from '../components/rating-bar.js';
import { keyHints, listenForKeys, sessionHeader, touchHint } from '../components/session.js';
import { studyCard } from '../components/study-card.js';
import { describeNextDue } from '../card-status.js';
import { attachSwipe } from '../components/swipe.js';
import { h } from '../dom.js';
import { plural } from '../format.js';
import { formatRoute } from '../router.js';

/** @typedef {import('../context.js').AppContext} AppContext */
/** @typedef {import('../../core/types.js').Rating} Rating */
/** @typedef {import('../../core/types.js').ReviewSession} ReviewSession */

/**
 * A review session: show each due card, reveal it, rate it.
 * @param {HTMLElement} root
 * @param {AppContext} ctx
 * @param {{ deckIds: string[] | null }} route
 * @returns {Promise<() => void>}
 */
export async function render(root, ctx, route) {
  let session = await ctx.study.startReview(route.deckIds);
  const leave = () => ctx.navigate('#/');
  const header = sessionHeader('Review', 'End review', leave);
  const stage = h('div', { class: 'session-stage' });
  const actions = h('div', { class: 'session-actions' });
  const view = h('section', { class: 'view session' }, header.el, stage, actions);
  root.append(view);

  /** @type {import('../components/study-card.js').StudyCard | null} */
  let current = null;
  let releaseSwipe = () => {};
  let revealed = false;
  let busy = false;
  let finished = false;

  const showButton = h(
    'button',
    {
      class: 'btn btn-primary btn-lg btn-block',
      attrs: { type: 'button', 'aria-keyshortcuts': 'Space Enter' },
      on: { click: () => reveal() },
    },
    'Show answer',
  );
  const revealHints = keyHints([
    ['Space', 'show answer'],
    ['Esc', 'end'],
  ]);
  const revealTouchHint = touchHint('Tap the card to see the answer.');
  const answerTouchHint = touchHint('Swipe left for Again, right for Good.');
  const rateHints = keyHints([
    ['1', 'again'],
    ['2', 'hard'],
    ['3', 'good'],
    ['4', 'easy'],
  ]);

  function dropCard() {
    releaseSwipe();
    current?.cleanup();
    current = null;
  }

  function showCard() {
    dropCard();
    const card = session.cards.get(session.queue[0] ?? '');
    if (!card) {
      finish();
      return;
    }
    revealed = false;
    current = studyCard(card, ctx, { onTap: () => reveal() });
    releaseSwipe = attachSwipe(current.el, {
      enabled: () => revealed && !busy,
      onLeft: () => void rate('again'),
      onRight: () => void rate('good'),
      labels: { left: 'Again', right: 'Good' },
    });
    stage.replaceChildren(current.el);
    header.setProgress(
      `${session.queue.length} left`,
      session.reviewed / (session.reviewed + session.queue.length),
    );
    const hadFocus = actions.contains(document.activeElement);
    actions.replaceChildren(showButton, revealHints, revealTouchHint);
    if (hadFocus || document.activeElement === document.body) showButton.focus();
  }

  function reveal() {
    if (!current || revealed || finished) return;
    revealed = true;
    ctx.announce(`Answer: ${current.reveal()}`);
    const bar = ratingBar(ctx.study.intervals(session), (rating) => void rate(rating));
    actions.replaceChildren(bar, rateHints, answerTouchHint);
    bar.focus();
  }

  /** @param {Rating} rating */
  async function rate(rating) {
    if (!revealed || busy || finished) return;
    busy = true;
    try {
      session = await ctx.study.rate(session, rating);
    } catch (error) {
      ctx.toast(error instanceof Error ? error.message : String(error));
      return;
    } finally {
      busy = false;
    }
    if (session.queue.length === 0) finish();
    else showCard();
  }

  function finish() {
    finished = true;
    dropCard();
    header.setProgress('Done', 1);
    const back = h(
      'a',
      { class: 'btn btn-primary btn-lg', attrs: { href: '#/' } },
      'Back to decks',
    );
    stage.replaceChildren(
      h(
        'div',
        { class: 'empty-state summary' },
        h('p', { class: 'summary-score' }, String(session.reviewed)),
        h('h2', null, `${session.reviewed === 1 ? 'card' : 'cards'} reviewed`),
        h(
          'dl',
          { class: 'tally' },
          RATINGS.map(({ rating, label }) =>
            h(
              'div',
              { class: 'stat', dataset: { rating } },
              h('dt', null, label),
              h('dd', null, String(session.tally[rating])),
            ),
          ),
        ),
        back,
      ),
    );
    actions.replaceChildren();
    ctx.announce(`Review finished. ${plural(session.reviewed, 'card')} reviewed.`);
    back.focus();
  }

  /** @param {number | null} nextDue */
  function nothingDue(nextDue) {
    finished = true;
    header.setProgress('', 0);
    stage.replaceChildren(
      h(
        'div',
        { class: 'empty-state' },
        h('div', { class: 'empty-art', attrs: { 'aria-hidden': 'true' } }),
        h('h2', null, 'Nothing due — come back later'),
        nextDue !== null && h('p', null, describeNextDue(nextDue, ctx.clock.now())),
        h(
          'p',
          null,
          'Every card here is scheduled for another day. Practice runs through the cards any ' +
            'time, without changing when they are due.',
        ),
        h(
          'div',
          { class: 'row' },
          h(
            'a',
            {
              class: 'btn btn-primary',
              attrs: { href: formatRoute({ name: 'practice', deckIds: route.deckIds, tag: null }) },
            },
            'Practice',
          ),
          h('a', { class: 'btn', attrs: { href: '#/' } }, 'Back to decks'),
        ),
      ),
    );
  }

  const releaseKeys = listenForKeys((key) => {
    if (key === 'Escape') {
      leave();
      return true;
    }
    if (finished) return false;
    if (!revealed && (key === ' ' || key === 'Enter')) {
      reveal();
      return true;
    }
    const rating = RATINGS.find((item) => item.key === key);
    if (revealed && rating) {
      void rate(rating.rating);
      return true;
    }
    return false;
  });

  if (session.queue.length === 0) nothingDue(await ctx.study.nextDue(route.deckIds));
  else showCard();

  return () => {
    releaseKeys();
    dropCard();
  };
}
