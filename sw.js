// @ts-check
// The Pages workflow replaces 'dev' with the commit, so keep this line exactly as it is.
const VERSION = 'dev';

/*
 * Pocket Flashcards service worker. A classic script, not a module.
 * The app shell is precached under `pf-<VERSION>`. `dev` serves network-first so edits
 * show on reload; a deployed version serves the shell cache-first. vendor/ (Mermaid) is
 * cached on first use in `pf-runtime`, which outlives versions and refreshes in the
 * background; examples/ are cached on use with the shell, so a new version drops them.
 */

const SHELL_CACHE = `pf-${VERSION}`;
const RUNTIME_CACHE = 'pf-runtime';

/** Every file the app needs offline, relative to this script. test/sw.test.js keeps it complete. */
const SHELL = [
  'index.html',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'src/app.js',
  'src/core/assets.js',
  'src/core/deck-format.js',
  'src/core/deck-groups.js',
  'src/core/hash.js',
  'src/core/ids.js',
  'src/core/markdown.js',
  'src/core/merge.js',
  'src/core/random.js',
  'src/core/scheduler.js',
  'src/core/search.js',
  'src/core/session.js',
  'src/core/types.js',
  'src/services/backup-service.js',
  'src/services/clock.js',
  'src/services/deck-service.js',
  'src/services/settings-service.js',
  'src/services/storage/indexeddb-storage.js',
  'src/services/storage/storage.js',
  'src/services/study-service.js',
  'src/styles/base.css',
  'src/styles/components.css',
  'src/styles/layout.css',
  'src/styles/tokens.css',
  'src/ui/ai-prompt.js',
  'src/ui/card-status.js',
  'src/ui/components/card-face.js',
  'src/ui/components/card-row.js',
  'src/ui/components/confirm.js',
  'src/ui/components/rating-bar.js',
  'src/ui/components/session.js',
  'src/ui/components/study-card.js',
  'src/ui/components/swipe.js',
  'src/ui/components/toast.js',
  'src/ui/context.js',
  'src/ui/dom.js',
  'src/ui/download.js',
  'src/ui/examples.js',
  'src/ui/format.js',
  'src/ui/rich/images.js',
  'src/ui/rich/mermaid.js',
  'src/ui/router.js',
  'src/ui/views/deck.js',
  'src/ui/views/decks.js',
  'src/ui/views/import.js',
  'src/ui/views/practice.js',
  'src/ui/views/review.js',
  'src/ui/views/search.js',
  'src/ui/views/settings.js',
];

/**
 * The parts of the service worker scope this script uses. The project type-checks
 * against the DOM library, which has no service worker types.
 * @typedef {Event & { waitUntil(promise: Promise<unknown>): void }} LifecycleEvent
 * @typedef {LifecycleEvent & { request: Request, respondWith(response: Promise<Response>): void }} FetchRequestEvent
 * @typedef {Event & { data: unknown }} WorkerMessageEvent
 * @typedef {object} WorkerScope
 * @property {() => Promise<void>} skipWaiting
 * @property {{ claim(): Promise<void> }} clients
 * @property {{ href: string, origin: string }} location
 * @property {(type: string, listener: (event: any) => void) => void} addEventListener
 */

const scope = /** @type {WorkerScope} */ (/** @type {unknown} */ (self));
const BASE = new URL('./', scope.location.href);
const INDEX_URL = new URL('index.html', BASE).href;

// `cache: 'reload'` skips the HTTP cache, so a deploy within its max-age does not
// precache the previous version's files under the new version.
scope.addEventListener('install', (/** @type {LifecycleEvent} */ event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        cache.addAll(SHELL.map((path) => new Request(new URL(path, BASE), { cache: 'reload' }))),
      ),
  );
});

scope.addEventListener('activate', (/** @type {LifecycleEvent} */ event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) => name.startsWith('pf-') && name !== SHELL_CACHE && name !== RUNTIME_CACHE,
          )
          .map((name) => caches.delete(name)),
      );
      await scope.clients.claim();
    })(),
  );
});

scope.addEventListener('message', (/** @type {WorkerMessageEvent} */ event) => {
  const data = /** @type {{ type?: string } | string | null} */ (event.data);
  if (data === 'SKIP_WAITING' || (typeof data === 'object' && data?.type === 'SKIP_WAITING')) {
    void scope.skipWaiting();
  }
});

scope.addEventListener('fetch', (/** @type {FetchRequestEvent} */ event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.location.origin || !url.href.startsWith(BASE.href)) return;
  const path = url.pathname.slice(BASE.pathname.length);

  if (request.mode === 'navigate') {
    event.respondWith(
      VERSION === 'dev'
        ? networkFirst(request, SHELL_CACHE, INDEX_URL)
        : cacheFirst(INDEX_URL, SHELL_CACHE),
    );
  } else if (path.startsWith('vendor/')) {
    event.respondWith(
      VERSION === 'dev'
        ? networkFirst(request, RUNTIME_CACHE)
        : staleWhileRevalidate(request, RUNTIME_CACHE, event),
    );
  } else if (path.startsWith('examples/')) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
  } else {
    event.respondWith(
      VERSION === 'dev' ? networkFirst(request, SHELL_CACHE) : cacheFirst(request, SHELL_CACHE),
    );
  }
});

/**
 * Network first, keeping a copy; the cached copy (or `fallbackUrl`) when offline.
 * @param {Request} request
 * @param {string} cacheName
 * @param {string} [fallbackUrl]
 * @returns {Promise<Response>}
 */
async function networkFirst(request, cacheName, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const copy = response.clone();
      void caches.open(cacheName).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch (error) {
    const cached =
      (await caches.match(request, { ignoreSearch: true })) ??
      (fallbackUrl ? await caches.match(fallbackUrl) : undefined);
    if (cached) return cached;
    throw error;
  }
}

/**
 * Cache first; on a miss, fetch and keep a copy.
 * @param {Request | string} request
 * @param {string} cacheName
 * @returns {Promise<Response>}
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) {
    const copy = response.clone();
    void caches.open(cacheName).then((cache) => cache.put(request, copy));
  }
  return response;
}

/**
 * The cached copy at once, refreshed in the background so a new vendored build arrives
 * on the next load; the network when nothing is cached yet.
 * @param {Request} request
 * @param {string} cacheName
 * @param {LifecycleEvent} event Keeps the worker alive while the refresh runs.
 * @returns {Promise<Response>}
 */
async function staleWhileRevalidate(request, cacheName, event) {
  const cached = await caches.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then(async (response) => {
    if (isCacheable(response)) await (await caches.open(cacheName)).put(request, response.clone());
    return response;
  });
  if (!cached) return refresh;
  event.waitUntil(refresh.catch(() => undefined));
  return cached;
}

/**
 * @param {Response} response
 * @returns {boolean}
 */
function isCacheable(response) {
  return response.ok && response.type === 'basic';
}
