// @ts-check
import { h } from './dom.js';

/**
 * A parsed hash route. `deckIds` is null for `all`.
 * @typedef {{ name: 'decks' }
 *   | { name: 'deck', deckId: string }
 *   | { name: 'review', deckIds: string[] | null }
 *   | { name: 'practice', deckIds: string[] | null, tag: string | null }
 *   | { name: 'import' }
 *   | { name: 'settings' }
 *   | { name: 'search' }
 *   | { name: 'not-found' }} Route
 */

/** @typedef {Route['name']} RouteName */

/** @typedef {() => void} Cleanup */

/**
 * A view draws into `root` and may return a cleanup function, directly or from a promise.
 * @template C
 * @typedef {(root: HTMLElement, ctx: C, route: any) => void | Cleanup | Promise<void | Cleanup>} View
 */

/** @type {Route} */
const NOT_FOUND = { name: 'not-found' };

/**
 * Parses `location.hash`. Unknown paths give `{ name: 'not-found' }`.
 * @param {string} hash Such as "#/deck/d_abc" or "" for the start page.
 * @returns {Route}
 */
export function parseRoute(hash) {
  const raw = hash.replace(/^#/, '');
  const [path, query = ''] = splitOnce(raw, '?');
  const segments = path.split('/').filter((segment) => segment !== '');
  const parts = segments.map(safeDecode);
  if (parts.some((part) => part === null)) return NOT_FOUND;
  const [name, param, ...rest] = /** @type {string[]} */ (parts);
  if (rest.length > 0) return NOT_FOUND;

  if (name === undefined) return { name: 'decks' };
  if (param === undefined) {
    if (name === 'import' || name === 'settings' || name === 'search') return { name };
    return NOT_FOUND;
  }
  if (name === 'deck') return { name: 'deck', deckId: param };
  if (name === 'review' || name === 'practice') {
    const rawIds = segments[1];
    const deckIds = parseDeckIds(rawIds);
    if (deckIds === undefined) return NOT_FOUND;
    if (name === 'review') return { name, deckIds };
    const tag = new URLSearchParams(query).get('tag');
    return { name, deckIds, tag: tag && tag.trim() !== '' ? tag : null };
  }
  return NOT_FOUND;
}

/**
 * Formats a route as a hash, the inverse of `parseRoute`.
 * @param {Route} route
 * @returns {string}
 */
export function formatRoute(route) {
  switch (route.name) {
    case 'decks':
    case 'not-found':
      return '#/';
    case 'deck':
      return `#/deck/${encodeURIComponent(route.deckId)}`;
    case 'review':
      return `#/review/${formatDeckIds(route.deckIds)}`;
    case 'practice': {
      const tag = route.tag ? `?tag=${encodeURIComponent(route.tag)}` : '';
      return `#/practice/${formatDeckIds(route.deckIds)}${tag}`;
    }
    default:
      return `#/${route.name}`;
  }
}

/**
 * @param {string | undefined} raw Still encoded, so a comma inside an id stays apart from the separator.
 * @returns {string[] | null | undefined} null for `all`, undefined when there is no usable id.
 */
function parseDeckIds(raw) {
  if (raw === undefined) return undefined;
  if (raw === 'all') return null;
  const ids = raw
    .split(',')
    .map(safeDecode)
    .filter((id) => id !== null && id.trim() !== '');
  if (ids.length === 0) return undefined;
  return /** @type {string[]} */ (ids);
}

/**
 * @param {string[] | null} deckIds
 * @returns {string}
 */
function formatDeckIds(deckIds) {
  if (deckIds === null || deckIds.length === 0) return 'all';
  return deckIds.map(encodeURIComponent).join(',');
}

/**
 * @param {string} text
 * @param {string} separator
 * @returns {[string, string | undefined]}
 */
function splitOnce(text, separator) {
  const at = text.indexOf(separator);
  return at === -1 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
}

/**
 * @param {string} text
 * @returns {string | null}
 */
function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

/**
 * Starts listening to hash changes and draws the matching view into `root`.
 * Runs the previous view's cleanup first, sets `document.title` from the view's
 * heading, and moves focus to that heading after the first view.
 * @template C
 * @param {object} options
 * @param {HTMLElement} options.root
 * @param {Record<RouteName, View<C>>} options.views
 * @param {C} options.ctx
 * @param {string} options.appName
 * @param {(route: Route) => void} [options.onRoute] Called before each view draws.
 * @returns {{ navigate: (target: Route | string, options?: { replace?: boolean }) => void, stop: () => void }}
 */
export function startRouter({ root, views, ctx, appName, onRoute }) {
  /** @type {Cleanup | null} */
  let cleanup = null;
  let token = 0;
  let first = true;

  async function show() {
    const route = parseRoute(location.hash);
    const current = ++token;
    runCleanup();
    onRoute?.(route);
    const container = h('div', { class: 'view-root' });
    root.replaceChildren(container);
    window.scrollTo(0, 0);

    /** @type {void | Cleanup} */
    let result = undefined;
    try {
      result = await views[route.name](container, ctx, route);
    } catch (error) {
      console.error(error);
      if (current === token) showError(container, error);
    }
    if (current !== token) {
      if (typeof result === 'function') result();
      return;
    }
    cleanup = typeof result === 'function' ? result : null;

    const heading = container.querySelector('h1');
    const title = heading?.textContent?.trim();
    document.title = title ? `${title} · ${appName}` : appName;
    if (heading && !first && !container.contains(document.activeElement)) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    first = false;
  }

  function runCleanup() {
    const previous = cleanup;
    cleanup = null;
    try {
      previous?.();
    } catch (error) {
      console.error(error);
    }
  }

  const onHashChange = () => void show();
  window.addEventListener('hashchange', onHashChange);
  void show();

  return {
    navigate(target, { replace = false } = {}) {
      const hash = typeof target === 'string' ? target : formatRoute(target);
      if (replace) {
        history.replaceState(null, '', hash);
        void show();
      } else if (location.hash === hash || (hash === '#/' && location.hash === '')) {
        void show();
      } else {
        location.hash = hash;
      }
    },
    stop() {
      window.removeEventListener('hashchange', onHashChange);
      runCleanup();
    },
  };
}

/**
 * @param {HTMLElement} container
 * @param {unknown} error
 */
function showError(container, error) {
  container.replaceChildren(
    h(
      'section',
      { class: 'view' },
      h(
        'div',
        { class: 'empty-state' },
        h('h1', null, 'Something went wrong'),
        h('p', null, error instanceof Error ? error.message : String(error)),
        h('a', { class: 'btn', attrs: { href: '#/' } }, 'Back to decks'),
      ),
    ),
  );
}
