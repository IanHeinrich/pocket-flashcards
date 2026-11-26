// @ts-check
import { confirmDialog } from '../components/confirm.js';
import { h } from '../dom.js';
import { backupFileName, downloadFile } from '../download.js';
import { formatBytes } from '../format.js';

/** @typedef {import('../context.js').AppContext} AppContext */
/** @typedef {import('../../core/types.js').Settings} Settings */

const THEMES = /** @type {const} */ ([
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
]);

/**
 * Study, appearance and privacy settings, backups, and deleting everything.
 * @param {HTMLElement} root
 * @param {AppContext} ctx
 */
export function render(root, ctx) {
  const settings = ctx.getSettings();

  const newPerDayError = h('p', { class: 'field-error', attrs: { hidden: true, id: 'new-error' } });
  const newPerDay = h('input', {
    class: 'input input-number',
    attrs: {
      id: 'new-per-day',
      type: 'number',
      inputmode: 'numeric',
      min: 0,
      max: 999,
      step: 1,
      value: settings.newPerDay,
      'aria-describedby': 'new-help new-error',
    },
    on: {
      change: async () => {
        const value = newPerDay.value.trim();
        if (value === '' || !Number.isFinite(Number(value))) {
          showNewPerDayError('Enter a number from 0 to 999.');
          return;
        }
        try {
          await ctx.updateSettings({ newPerDay: Number(value) });
          newPerDayError.hidden = true;
          newPerDay.removeAttribute('aria-invalid');
          ctx.toast('Saved.');
        } catch (error) {
          showNewPerDayError(error instanceof Error ? error.message : String(error));
        }
      },
    },
  });

  const themeGroup = h(
    'fieldset',
    { class: 'segmented' },
    h('legend', { class: 'visually-hidden' }, 'Theme'),
    THEMES.map(([value, label]) =>
      h(
        'label',
        null,
        h('input', {
          attrs: { type: 'radio', name: 'theme', value, checked: settings.theme === value },
          on: { change: () => void save({ theme: value }) },
        }),
        h('span', null, label),
      ),
    ),
  );

  const remoteImages = h('input', {
    class: 'switch',
    attrs: {
      id: 'remote-images',
      type: 'checkbox',
      role: 'switch',
      checked: settings.allowRemoteImages,
      'aria-describedby': 'remote-help',
    },
    on: { change: () => void saveAndReload({ allowRemoteImages: remoteImages.checked }) },
  });

  const backupError = h('p', {
    class: 'notice notice-error',
    attrs: { role: 'alert', hidden: true },
  });
  const backupInput = h('input', {
    class: 'visually-hidden',
    attrs: { type: 'file', accept: '.json,application/json', tabindex: -1, 'aria-hidden': 'true' },
    on: {
      change: () => {
        const file = backupInput.files?.[0];
        backupInput.value = '';
        if (file) void importBackup(file);
      },
    },
  });

  const storageLine = h('p', { class: 'muted small' });
  void showStorage(storageLine);

  root.append(
    h(
      'section',
      { class: 'view' },
      h('header', { class: 'view-header' }, h('h1', null, 'Settings')),

      group(
        'Study',
        h(
          'div',
          { class: 'setting' },
          h(
            'div',
            { class: 'setting-text' },
            h(
              'label',
              { class: 'field-label', attrs: { for: 'new-per-day' } },
              'New cards per day',
            ),
            h(
              'p',
              { class: 'field-help', attrs: { id: 'new-help' } },
              'How many new cards reviews introduce each day, across all decks.',
            ),
            newPerDayError,
          ),
          newPerDay,
        ),
      ),

      group(
        'Appearance',
        h(
          'div',
          { class: 'setting' },
          h('div', { class: 'setting-text' }, h('span', { class: 'field-label' }, 'Theme')),
          themeGroup,
        ),
      ),

      group(
        'Privacy',
        h(
          'div',
          { class: 'setting' },
          h(
            'div',
            { class: 'setting-text' },
            h(
              'label',
              { class: 'field-label', attrs: { for: 'remote-images' } },
              'Allow remote images',
            ),
            h(
              'p',
              { class: 'field-help', attrs: { id: 'remote-help' } },
              'Loading an image from the web (https://) tells that server you are looking at the card, so this is off by default. The app reloads when you change it.',
            ),
          ),
          remoteImages,
        ),
      ),

      group(
        'Backup',
        h(
          'p',
          { class: 'muted small' },
          'A backup holds every deck, card, image, review and setting. Use it to keep your progress safe or to move it to another device.',
        ),
        backupError,
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            { class: 'btn', attrs: { type: 'button' }, on: { click: () => void exportBackup() } },
            'Export backup',
          ),
          h(
            'button',
            {
              class: 'btn',
              attrs: { type: 'button' },
              on: { click: () => backupInput.click() },
            },
            'Import backup',
          ),
          backupInput,
        ),
      ),

      group(
        'Danger zone',
        h(
          'div',
          { class: 'setting' },
          h(
            'div',
            { class: 'setting-text' },
            h('span', { class: 'field-label' }, 'Delete all data'),
            h(
              'p',
              { class: 'field-help' },
              'Removes every deck, card, image, review and setting from this device.',
            ),
          ),
          h(
            'button',
            {
              class: 'btn btn-danger',
              attrs: { type: 'button' },
              on: { click: () => void deleteAll() },
            },
            'Delete all data',
          ),
        ),
      ),

      group(
        'About',
        h(
          'p',
          { class: 'muted small' },
          'Pocket Flashcards keeps your decks, progress and images in this browser’s storage on this device. It has no account and no server, and makes no requests to other sites. Clearing this site’s data in your browser deletes everything, so export a backup now and then.',
        ),
        storageLine,
      ),
    ),
  );

  /** @param {string} text */
  function showNewPerDayError(text) {
    newPerDayError.textContent = text;
    newPerDayError.hidden = false;
    newPerDay.setAttribute('aria-invalid', 'true');
  }

  /**
   * @param {Partial<Settings>} patch
   * @returns {Promise<boolean>} Whether it was saved.
   */
  async function save(patch) {
    try {
      await ctx.updateSettings(patch);
      return true;
    } catch (error) {
      ctx.toast(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Saves, then reloads so the page's image policy matches the setting.
   * @param {Partial<Settings>} patch
   */
  async function saveAndReload(patch) {
    if (await save(patch)) location.reload();
  }

  async function exportBackup() {
    try {
      const data = await ctx.backup.exportBackup();
      const fileName = backupFileName(new Date(ctx.clock.now()));
      downloadFile(fileName, JSON.stringify(data), 'application/json');
      ctx.toast(`Saved ${fileName}.`);
    } catch (error) {
      ctx.toast(error instanceof Error ? error.message : String(error));
    }
  }

  /** @param {File} file */
  async function importBackup(file) {
    backupError.hidden = true;
    const ok = await confirmDialog({
      title: 'Restore this backup?',
      message: `This replaces everything on this device with the contents of ${file.name}. Decks and progress that are not in the backup are lost.`,
      confirmLabel: 'Replace everything',
      danger: true,
    });
    if (!ok) return;
    try {
      await ctx.backup.importBackup(await file.text());
      await ctx.reloadSettings();
      ctx.toast('Backup restored.');
      ctx.navigate('#/');
    } catch (error) {
      backupError.textContent = error instanceof Error ? error.message : String(error);
      backupError.hidden = false;
    }
  }

  async function deleteAll() {
    const ok = await confirmDialog({
      title: 'Delete all data?',
      message:
        'Every deck, card, image, review and setting on this device is deleted. This cannot be undone. Export a backup first if you might want them back.',
      confirmLabel: 'Delete everything',
      danger: true,
      requireText: 'delete',
    });
    if (!ok) return;
    await ctx.deleteAllData();
    ctx.toast('All data deleted.');
    ctx.navigate('#/');
  }
}

/**
 * @param {string} title
 * @param {...import('../dom.js').Child} children
 * @returns {HTMLElement}
 */
function group(title, ...children) {
  return h(
    'section',
    { class: 'section' },
    h('h2', { class: 'section-title' }, title),
    h('div', { class: 'panel' }, ...children),
  );
}

/** @param {HTMLElement} line */
async function showStorage(line) {
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  if (!estimate || estimate.usage === undefined) {
    line.hidden = true;
    return;
  }
  const quota = estimate.quota ? ` of about ${formatBytes(estimate.quota)} available` : '';
  const kept = persisted ? ' The browser has agreed to keep it.' : '';
  line.textContent = `Using ${formatBytes(estimate.usage)}${quota}.${kept}`;
}
