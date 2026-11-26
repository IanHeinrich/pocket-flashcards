// @ts-check

/** @typedef {import('./storage/storage.js').Storage} Storage */
/** @typedef {import('../core/types.js').Settings} Settings */

const THEMES = ['system', 'light', 'dark'];
const MAX_NEW_PER_DAY = 999;

/**
 * Checks settings values, all or some of them.
 * @param {Record<string, unknown>} values
 * @returns {string | null} The first problem in plain words, or null when every value is valid.
 */
export function findSettingsProblem(values) {
  for (const [key, value] of Object.entries(values)) {
    if (key === 'newPerDay') {
      if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > MAX_NEW_PER_DAY) {
        return `New cards per day must be a whole number from 0 to ${MAX_NEW_PER_DAY}.`;
      }
    } else if (key === 'theme') {
      if (typeof value !== 'string' || !THEMES.includes(value)) {
        return 'Theme must be "system", "light" or "dark".';
      }
    } else if (key === 'allowRemoteImages') {
      if (typeof value !== 'boolean')
        return 'Allow remote images must be on or off (true or false).';
    } else {
      return `"${key}" is not a setting. Use newPerDay, theme or allowRemoteImages.`;
    }
  }
  return null;
}

export class SettingsService {
  /** @type {Storage} */
  #storage;

  /** @param {Storage} storage */
  constructor(storage) {
    this.#storage = storage;
  }

  /** @returns {Promise<Settings>} */
  get() {
    return this.#storage.getSettings();
  }

  /**
   * Validates and saves some settings. Throws an Error naming the first bad value.
   * @param {Partial<Settings>} patch
   * @returns {Promise<Settings>} Every setting after the change.
   */
  async update(patch) {
    const problem = findSettingsProblem(patch);
    if (problem) throw new Error(problem);
    const next = { ...(await this.#storage.getSettings()), ...patch };
    await this.#storage.putSettings(next);
    return next;
  }
}
