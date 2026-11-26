// @ts-check
import { h } from '../dom.js';

/**
 * @typedef {object} ToastOptions
 * @property {{ label: string, onClick: () => void }} [action] A button in the toast.
 * @property {number} [duration] Milliseconds before it goes; 0 keeps it until dismissed.
 */

const DEFAULT_DURATION = 5000;

/**
 * Shows a short message at the bottom of the screen. The container is a polite live region.
 * @param {string} message
 * @param {ToastOptions} [options]
 * @returns {() => void} Dismisses the toast.
 */
export function showToast(message, { action, duration = DEFAULT_DURATION } = {}) {
  const container = document.getElementById('toasts');
  if (!container) return () => {};
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    toast.remove();
  };
  const toast = h(
    'div',
    { class: 'toast' },
    h('span', { class: 'toast-message' }, message),
    action &&
      h(
        'button',
        {
          class: 'btn',
          attrs: { type: 'button' },
          on: {
            click: () => {
              dismiss();
              action.onClick();
            },
          },
        },
        action.label,
      ),
    h(
      'button',
      {
        class: 'icon-btn',
        attrs: { type: 'button', 'aria-label': 'Dismiss message' },
        on: { click: dismiss },
      },
      '×',
    ),
  );
  container.append(toast);
  if (duration > 0) timer = setTimeout(dismiss, duration);
  return dismiss;
}
