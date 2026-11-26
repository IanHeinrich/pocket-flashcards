// @ts-check
import { h } from '../dom.js';

/**
 * @typedef {object} ConfirmOptions
 * @property {string} title
 * @property {string} message
 * @property {string} confirmLabel
 * @property {string} [cancelLabel]
 * @property {boolean} [danger] Draws the confirm button in the danger colour.
 * @property {string} [requireText] The person must type this word to enable the confirm button.
 */

/**
 * Asks a yes-or-no question in a modal dialog. Escape and Cancel answer no.
 * @param {ConfirmOptions} options
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  requireText,
}) {
  return new Promise((resolve) => {
    const previousFocus = /** @type {HTMLElement | null} */ (document.activeElement);
    const titleId = `dialog-title-${Date.now()}`;
    const confirmButton = h(
      'button',
      {
        class: danger ? 'btn btn-danger-solid' : 'btn btn-primary',
        attrs: { type: 'submit', value: 'confirm', disabled: Boolean(requireText) },
      },
      confirmLabel,
    );
    const cancelButton = h(
      'button',
      { class: 'btn', attrs: { type: 'submit', value: 'cancel' } },
      cancelLabel,
    );
    const typed =
      requireText &&
      h('input', {
        class: 'input',
        attrs: {
          type: 'text',
          autocomplete: 'off',
          autocapitalize: 'off',
          spellcheck: 'false',
          'aria-label': `Type ${requireText} to confirm`,
        },
        on: {
          input: (event) => {
            const value = /** @type {HTMLInputElement} */ (event.target).value.trim();
            confirmButton.disabled = value.toLowerCase() !== requireText.toLowerCase();
          },
        },
      });

    const dialog = h(
      'dialog',
      { class: 'dialog', attrs: { 'aria-labelledby': titleId } },
      h(
        'form',
        { class: 'dialog-form', attrs: { method: 'dialog' } },
        h('h2', { attrs: { id: titleId } }, title),
        h('p', { class: 'dialog-message' }, message),
        typed &&
          h(
            'label',
            { class: 'field' },
            h('span', { class: 'field-help' }, `Type “${requireText}” to confirm.`),
            typed,
          ),
        h('div', { class: 'dialog-actions' }, cancelButton, confirmButton),
      ),
    );

    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      dialog.remove();
      previousFocus?.focus?.();
      resolve(confirmed);
    });
    document.body.append(dialog);
    dialog.showModal();
    (typed || cancelButton).focus();
  });
}
