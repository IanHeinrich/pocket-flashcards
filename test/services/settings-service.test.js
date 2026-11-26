// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SettingsService } from '../../src/services/settings-service.js';
import { MemoryStorage } from '../../src/services/storage/memory-storage.js';
import { DEFAULT_SETTINGS } from '../../src/services/storage/storage.js';

/** @typedef {import('../../src/core/types.js').Settings} Settings */

function setup() {
  const storage = new MemoryStorage();
  return { storage, settings: new SettingsService(storage) };
}

/**
 * @param {Record<string, unknown>} patch
 * @returns {Partial<Settings>}
 */
function bad(patch) {
  return /** @type {Partial<Settings>} */ (patch);
}

describe('SettingsService', () => {
  it('starts with the default settings', async () => {
    const { settings } = setup();
    assert.deepEqual(await settings.get(), DEFAULT_SETTINGS);
  });

  it('saves a change and returns every setting', async () => {
    const { storage, settings } = setup();
    const result = await settings.update({ newPerDay: 0, theme: 'dark' });
    assert.deepEqual(result, { ...DEFAULT_SETTINGS, newPerDay: 0, theme: 'dark' });
    assert.deepEqual(await storage.getSettings(), result);
    assert.deepEqual(await settings.update({ allowRemoteImages: true }), {
      ...result,
      allowRemoteImages: true,
    });
  });

  it('accepts the largest number of new cards per day', async () => {
    const { settings } = setup();
    assert.equal((await settings.update({ newPerDay: 999 })).newPerDay, 999);
  });

  for (const newPerDay of [-1, 1000, 2.5, Number.NaN, '20']) {
    it(`refuses ${String(newPerDay)} new cards per day`, async () => {
      const { storage, settings } = setup();
      await assert.rejects(settings.update(bad({ newPerDay })), {
        message: 'New cards per day must be a whole number from 0 to 999.',
      });
      assert.deepEqual(await storage.getSettings(), DEFAULT_SETTINGS);
    });
  }

  it('refuses a theme that does not exist', async () => {
    const { settings } = setup();
    await assert.rejects(
      settings.update(bad({ theme: 'blue' })),
      /Theme must be "system", "light" or "dark"/,
    );
  });

  it('refuses a remote images value that is not true or false', async () => {
    const { settings } = setup();
    await assert.rejects(settings.update(bad({ allowRemoteImages: 'yes' })), /true or false/);
  });

  it('refuses a setting it does not know', async () => {
    const { settings } = setup();
    await assert.rejects(settings.update(bad({ fontSize: 3 })), /"fontSize" is not a setting/);
  });
});
