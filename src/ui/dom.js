// @ts-check

/**
 * Element options for `h`.
 * @typedef {object} Props
 * @property {string} [class]
 * @property {Record<string, string | number | boolean | null | undefined>} [attrs]
 *   `true` sets an empty attribute; `false`, `null` and `undefined` leave it out.
 * @property {Record<string, string>} [dataset]
 * @property {Partial<{ [K in keyof HTMLElementEventMap]: (event: HTMLElementEventMap[K]) => void }>} [on]
 */

/** @typedef {Node | string | number | null | undefined | false | Child[]} Child */

/**
 * Builds an element. Strings and numbers become text nodes, so text never becomes markup.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Props | null} [props]
 * @param {...Child} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props?.class) el.className = props.class;
  for (const [name, value] of Object.entries(props?.attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
  Object.assign(el.dataset, props?.dataset ?? {});
  for (const [type, listener] of Object.entries(props?.on ?? {})) {
    el.addEventListener(type, /** @type {EventListener} */ (listener));
  }
  append(el, children);
  return el;
}

/**
 * @param {Node} parent
 * @param {Child[]} children
 */
function append(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else if (typeof child === 'string' || typeof child === 'number') {
      parent.appendChild(document.createTextNode(String(child)));
    } else parent.appendChild(child);
  }
}

/**
 * True when a key press is meant for a text field, a select or an open dialog,
 * so view shortcuts should leave it alone.
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
export function isTypingTarget(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  if (document.querySelector('dialog[open]')) return true;
  const target = /** @type {HTMLElement | null} */ (event.target);
  if (!target || !target.tagName) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
