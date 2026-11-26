// @ts-check
import { h } from './dom.js';

/**
 * Saves text as a file through a temporary link to an object URL.
 * @param {string} fileName
 * @param {string} content
 * @param {string} type MIME type.
 */
export function downloadFile(fileName, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = h('a', { attrs: { href: url, download: fileName, hidden: true } });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * A file name for a deck: characters that file systems refuse become " - ".
 * @param {string} name Such as "Science / Chemistry basics".
 * @param {string} extension Such as ".md".
 * @returns {string} Such as "Science - Chemistry basics.md".
 */
export function deckFileName(name, extension) {
  const printable = [...name].filter((char) => char >= ' ' && char !== '\u007f').join('');
  const base = printable
    .replace(/\s*[\\/:*?"<>|][\s\\/:*?"<>|]*/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.-]+|[\s.-]+$/g, '');
  return `${base || 'deck'}${extension}`;
}

/**
 * The backup file name for a day, in the local time zone.
 * @param {Date} date
 * @returns {string} Such as "pocket-flashcards-backup-2026-01-15.json".
 */
export function backupFileName(date) {
  const pad = (/** @type {number} */ value) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `pocket-flashcards-backup-${day}.json`;
}
