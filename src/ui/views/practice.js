// @ts-check
import { practiceBar } from '../components/rating-bar.js';
import { keyHints, listenForKeys, sessionHeader, touchHint } from '../components/session.js';
import { studyCard } from '../components/study-card.js';
import { attachSwipe } from '../components/swipe.js';
import { h } from '../dom.js';

/** @typedef {import('../context.js').AppContext} AppContext */
/** @typedef {import('../../core/types.js').PracticeSession} PracticeSession */

/**
 * A practice run: every card of the chosen decks, shuffled, without touching scheduling.
 * @param {HTMLElement} root
 * @param {AppContext} ctx
 * @param {{ deckIds: string[] | null, tag: string | null }} route
 * @returns {Promise<() => void>}
 */
export async function render(root, ctx, route) {
  let session = await ctx.study.startPractice(
    { deckIds: route.deckIds, tag: route.tag ?? undefined },
    Math.random,
  );
  const leave = () => ctx.navigate('#/');
  const header = sessionHeader('Practice', 'End practice', leave);
  const stage = h('div', { class: 'session-stage' });
  const actions = h('div', { class: 'session-actions' });
  const note = h('p', { class: 'session-note' }, 'Practice doesn’t change when cards are due.');
  root.append(h('section', { class: 'view session' }, header.el, stage, actions));

  /** @type {import('../components/study-card.js').StudyCard | null} */
  let current = null;
  let releaseSwipe = () => {};
  let revealed = false;
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
  const answerTouchHint = touchHint('Swipe left if you missed it, right if you got it.');
  const answerHints = keyHints([
    ['1', 'missed it'],
    ['2', 'got it'],
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
    finished = false;
    revealed = false;
    current = studyCard(card, ctx, { onTap: () => reveal() });
    releaseSwipe = attachSwipe(current.el, {
      enabled: () => revealed,
      onLeft: () => answer(false),
      onRight: () => answer(true),
      labels: { left: 'Missed it', right: 'Got it' },
    });
    stage.replaceChildren(current.el, note);
    const answered = session.correct + session.missed.length;
    header.setProgress(
      `${session.queue.length} left`,
      answered / (answered + session.queue.length),
    );
    const hadFocus = actions.contains(document.activeElement);
    actions.replaceChildren(showButton, revealHints, revealTouchHint);
    if (hadFocus || document.activeElement === document.body) showButton.focus();
  }

  function reveal() {
    if (!current || revealed || finished) return;
    revealed = true;
    ctx.announce(`Answer: ${current.reveal()}`);
    const bar = practiceBar(answer);
    actions.replaceChildren(bar, answerHints, answerTouchHint);
    bar.focus();
  }

  /** @param {boolean} correct */
  function answer(correct) {
    if (!revealed || finished) return;
    session = ctx.study.answerPractice(session, correct);
    if (session.queue.length === 0) finish();
    else showCard();
  }

  function finish() {
    finished = true;
    dropCard();
    header.setProgress('Done', 1);
    const total = session.correct + session.missed.length;
    const missed = session.missed.length;
    const done = h('a', { class: 'btn btn-lg', attrs: { href: '#/' } }, 'Done');
    const retry =
      missed > 0 &&
      h(
        'button',
        {
          class: 'btn btn-primary btn-lg',
          attrs: { type: 'button' },
          on: {
            click: () => {
              session = ctx.study.retryMissed(session, Math.random);
              showCard();
            },
          },
        },
        `Retry missed (${missed})`,
      );
    stage.replaceChildren(
      h(
        'div',
        { class: 'empty-state summary' },
        h('p', { class: 'summary-score' }, `${session.correct}/${total}`),
        h(
          'h2',
          null,
          missed === 0 ? 'You got every card' : `You got ${session.correct} of ${total}`,
        ),
        h('p', null, 'Practice doesn’t change when cards are due.'),
        h('div', { class: 'row' }, retry, done),
      ),
    );
    actions.replaceChildren();
    ctx.announce(`Practice finished. ${session.correct} of ${total} correct.`);
    (retry || done).focus();
  }

  function empty() {
    finished = true;
    header.setProgress('', 0);
    stage.replaceChildren(
      h(
        'div',
        { class: 'empty-state' },
        h('h2', null, 'No cards to practice'),
        h('p', null, 'Import a deck, or pick a deck that has cards.'),
        h('a', { class: 'btn btn-primary', attrs: { href: '#/' } }, 'Back to decks'),
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
    if (revealed && (key === '1' || key === '2')) {
      answer(key === '2');
      return true;
    }
    return false;
  });

  if (session.queue.length === 0) empty();
  else showCard();

  return () => {
    releaseKeys();
    dropCard();
  };
}
