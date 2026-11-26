// @ts-check

/**
 * What every view receives. Built once in `src/app.js`.
 * @typedef {object} AppContext
 * @property {import('../services/deck-service.js').DeckService} decks
 * @property {import('../services/study-service.js').StudyService} study
 * @property {import('../services/settings-service.js').SettingsService} settings
 * @property {import('../services/backup-service.js').BackupService} backup
 * @property {import('../services/clock.js').Clock} clock
 * @property {(target: import('./router.js').Route | string, options?: { replace?: boolean }) => void} navigate
 * @property {() => import('../core/types.js').Settings} getSettings The settings as last loaded or saved.
 * @property {(patch: Partial<import('../core/types.js').Settings>) => Promise<import('../core/types.js').Settings>} updateSettings
 *   Saves, keeps `getSettings` current and applies the theme.
 * @property {() => Promise<void>} reloadSettings Reads the settings again, after a backup is restored.
 * @property {(message: string, options?: import('./components/toast.js').ToastOptions) => void} toast
 * @property {(text: string) => void} announce Reads text out through the page's live region.
 * @property {import('./rich/images.js').GetAsset} getAsset
 * @property {() => void} afterImport Call after a successful import.
 * @property {() => Promise<void>} deleteAllData Deletes every deck, card, review and setting.
 */

export {};
