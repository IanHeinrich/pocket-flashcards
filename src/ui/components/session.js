// @ts-check
import { h, isTypingTarget } from '../dom.js';

/**
 * The top of a review or practice session: a close button, the title and progress.
 * @param {string} title
 * @param {string} closeLabel Such as "End review".
 * @param {() => void} onClose
 * @returns {{ el: HTMLElement, setProgress: (text: string, done: number) => void }}
 */
export function sessionHeader(title, closeLabel, onClose) {
  const text = h('p', { class: 'session-progress-text' });
  const bar = h('div', { class: 'progress-bar' });
  const el = h(
    'header',
    { class: 'stack' },
    h(
      'div',
      { class: 'session-top' },
      h(
        'button',
        {
          class: 'icon-btn',
          attrs: { type: 'button', 'aria-label': closeLabel, 'aria-keyshortcuts': 'Escape' },
          on: { click: onClose },
        },
        closeIcon(),
      ),
      h('h1', { class: 'session-title' }, title),
      text,
    ),
    h('div', { class: 'progress', attrs: { 'aria-hidden': 'true' } }, bar),
  );
  return {
    el,
    setProgress(label, done) {
      text.textContent = label;
      bar.style.width = `${Math.round(Math.min(1, Math.max(0, done)) * 100)}%`;
    },
  };
}

/** @returns {SVGSVGElement} */
function closeIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M6 6l12 12M18 6L6 18');
  svg.append(path);
  return svg;
}

/**
 * Keyboard hints, shown only where there is a keyboard and a fine pointer.
 * @param {[string, string][]} hints Key and what it does.
 * @returns {HTMLElement}
 */
export function keyHints(hints) {
  return h(
    'p',
    { class: 'key-hints', attrs: { 'aria-hidden': 'true' } },
    hints.map(([key, label]) => h('span', null, h('kbd', null, key), ' ', label)),
  );
}

/**
 * A hint about tapping and swiping, shown only on touch screens. Hidden from screen
 * readers, which use the buttons instead.
 * @param {string} text
 * @returns {HTMLElement}
 */
export function touchHint(text) {
  return h('p', { class: 'touch-hint', attrs: { 'aria-hidden': 'true' } }, text);
}

/**
 * Listens for session shortcuts. Keys typed into fields and dialogs are ignored, and
 * Space or Enter on a focused button or link is left to that control.
 * @param {(key: string, event: KeyboardEvent) => boolean} onKey Returns true when it handled the key.
 * @returns {() => void}
 */
export function listenForKeys(onKey) {
  /** @param {KeyboardEvent} event */
  const listener = (event) => {
    if (event.repeat || isTypingTarget(event)) return;
    const target = /** @type {HTMLElement} */ (event.target);
    const onControl = target.closest?.('button, a, summary');
    if ((event.key === ' ' || event.key === 'Enter') && onControl) return;
    if (onKey(event.key, event)) event.preventDefault();
  };
  document.addEventListener('keydown', listener);
  return () => document.removeEventListener('keydown', listener);
}
