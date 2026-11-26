// @ts-check
import { sm2 } from './core/scheduler.js';
import { BackupService } from './services/backup-service.js';
import { systemClock } from './services/clock.js';
import { DeckService } from './services/deck-service.js';
import { SettingsService } from './services/settings-service.js';
import { IndexedDbStorage } from './services/storage/indexeddb-storage.js';
import { StudyService } from './services/study-service.js';
import { showToast } from './ui/components/toast.js';
import { h } from './ui/dom.js';
import { startRouter } from './ui/router.js';
import * as decksView from './ui/views/decks.js';
import * as deckView from './ui/views/deck.js';
import * as importView from './ui/views/import.js';
import * as practiceView from './ui/views/practice.js';
import * as reviewView from './ui/views/review.js';
import * as searchView from './ui/views/search.js';
import * as settingsView from './ui/views/settings.js';

/** @typedef {import('./core/types.js').Settings} Settings */
/** @typedef {import('./ui/context.js').AppContext} AppContext */
/** @typedef {import('./ui/router.js').Route} Route */

const APP_NAME = 'Pocket Flashcards';

/** The browser bar colour for each theme; it matches `--color-bg` in tokens.css. */
const THEME_COLORS = { light: '#f5f6fa', dark: '#0d0f15' };

const IMAGE_POLICY_ID = 'image-policy';

/** Which main navigation item each route belongs to. */
const NAV_FOR_ROUTE = /** @type {Record<Route['name'], string>} */ ({
  decks: 'decks',
  deck: 'decks',
  review: 'decks',
  practice: 'decks',
  'not-found': 'decks',
  import: 'import',
  search: 'search',
  settings: 'settings',
});

async function main() {
  const root = /** @type {HTMLElement} */ (document.getElementById('app'));
  const announcer = /** @type {HTMLElement} */ (document.getElementById('announcer'));

  /** @type {IndexedDbStorage} */
  let storage;
  try {
    storage = await IndexedDbStorage.open(undefined, { onVersionChange: offerReloadForOtherTab });
  } catch (error) {
    console.error(error);
    showStartupError(root);
    return;
  }

  const decks = new DeckService(storage, systemClock);
  const study = new StudyService(storage, sm2, systemClock);
  const settings = new SettingsService(storage);
  const backup = new BackupService(storage, systemClock);

  let current = await settings.get();
  applySettings(current);
  let askedToPersist = false;

  /** @type {AppContext} */
  const ctx = {
    decks,
    study,
    settings,
    backup,
    clock: systemClock,
    navigate: (target, options) => router.navigate(target, options),
    getSettings: () => current,
    async updateSettings(patch) {
      current = await settings.update(patch);
      applySettings(current);
      return current;
    },
    async reloadSettings() {
      current = await settings.get();
      applySettings(current);
    },
    toast: (message, options) => void showToast(message, options),
    announce(text) {
      announcer.textContent = '';
      // A fresh node after a tick makes screen readers read repeated text again.
      setTimeout(() => {
        announcer.textContent = text;
      }, 50);
    },
    getAsset: (id) => storage.getAsset(id),
    afterImport() {
      if (askedToPersist) return;
      askedToPersist = true;
      void navigator.storage?.persist?.().catch(() => false);
    },
    async deleteAllData() {
      await storage.clear();
      current = await settings.get();
      applySettings(current);
    },
  };

  const router = startRouter({
    root,
    ctx,
    appName: APP_NAME,
    views: {
      decks: decksView.render,
      deck: deckView.render,
      review: reviewView.render,
      practice: practiceView.render,
      import: importView.render,
      settings: settingsView.render,
      search: searchView.render,
      'not-found': renderNotFound,
    },
    onRoute(route) {
      document.body.dataset.route = route.name;
      const active = NAV_FOR_ROUTE[route.name];
      for (const link of document.querySelectorAll('[data-nav]')) {
        const isActive = /** @type {HTMLElement} */ (link).dataset.nav === active;
        if (isActive) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    },
  });

  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => applyTheme(current.theme));

  registerServiceWorker();
}

/**
 * Applies the settings that live outside the views: the theme and the image policy.
 * @param {Settings} settings
 */
function applySettings(settings) {
  applyTheme(settings.theme);
  if (!settings.allowRemoteImages) blockRemoteImages();
}

/**
 * Adds a second Content-Security-Policy that allows images only from this site, `data:`
 * and `blob:`, so nothing a card or diagram draws can load an image from the web. A
 * second policy can only tighten the first and cannot be taken back, so Settings
 * reloads the app when remote images are turned on.
 */
function blockRemoteImages() {
  if (document.getElementById(IMAGE_POLICY_ID)) return;
  document.head.append(
    h('meta', {
      attrs: {
        id: IMAGE_POLICY_ID,
        'http-equiv': 'Content-Security-Policy',
        content: "img-src 'self' data: blob:",
      },
    }),
  );
}

/**
 * Sets `data-theme` on <html>; tokens.css picks the colours. "system" follows the device.
 * @param {Settings['theme']} theme
 */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  for (const meta of metas) {
    const media = meta.getAttribute('media') ?? '';
    const forDark = media.includes('dark');
    const color =
      theme === 'system' ? THEME_COLORS[forDark ? 'dark' : 'light'] : THEME_COLORS[theme];
    meta.setAttribute('content', color);
  }
}

/** @param {HTMLElement} root */
function renderNotFound(root) {
  root.append(
    h(
      'section',
      { class: 'view' },
      h(
        'div',
        { class: 'empty-state' },
        h('h1', null, 'Page not found'),
        h('p', null, 'This link does not lead anywhere in the app.'),
        h('a', { class: 'btn btn-primary', attrs: { href: '#/' } }, 'Go to your decks'),
      ),
    ),
  );
}

/** @param {HTMLElement} root */
function showStartupError(root) {
  root.replaceChildren(
    h(
      'div',
      { class: 'empty-state' },
      h('h1', null, 'Storage is not available'),
      h(
        'p',
        null,
        'Pocket Flashcards keeps your cards in this browser’s storage, and the browser did not allow it. ' +
          'Private or incognito windows sometimes block it. Open the app in a normal window and try again.',
      ),
    ),
  );
}

let offeredReloadForOtherTab = false;

/**
 * Another tab opened a newer version of the database, so this tab's connection has
 * closed; only a reload brings it back.
 */
function offerReloadForOtherTab() {
  if (offeredReloadForOtherTab) return;
  offeredReloadForOtherTab = true;
  showToast('Pocket Flashcards was updated in another tab.', {
    duration: 0,
    action: { label: 'Reload', onClick: () => location.reload() },
  });
}

/**
 * Registers the service worker and offers a reload when a new version is waiting.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  let userAskedToReload = false;

  /** @param {ServiceWorker} worker */
  const offerReload = (worker) => {
    showToast('A new version of Pocket Flashcards is ready.', {
      duration: 0,
      action: {
        label: 'Reload',
        onClick: () => {
          userAskedToReload = true;
          worker.postMessage({ type: 'SKIP_WAITING' });
        },
      },
    });
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!userAskedToReload || reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker
    .register('sw.js')
    .then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        offerReload(registration.waiting);
      }
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            offerReload(worker);
          }
        });
      });
    })
    .catch((error) => console.error('Service worker registration failed', error));
}

void main();
