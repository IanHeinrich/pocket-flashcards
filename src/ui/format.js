// @ts-check

/**
 * A count with its noun: "1 card", "3 cards".
 * @param {number} count
 * @param {string} singular
 * @param {string} [pluralForm] Defaults to the singular plus "s".
 * @returns {string}
 */
export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * What an import did, in one sentence.
 * @param {string} deckName
 * @param {{ added: number, updated: number, removed: number }} result
 * @returns {string} Such as `Imported "Capitals": 12 new, 1 updated.`
 */
export function describeImport(deckName, result) {
  const parts = [
    result.added > 0 && `${result.added} new`,
    result.updated > 0 && `${result.updated} updated`,
    result.removed > 0 && `${result.removed} removed`,
  ].filter(Boolean);
  return parts.length > 0
    ? `Imported “${deckName}”: ${parts.join(', ')}.`
    : `“${deckName}” is already up to date.`;
}

/**
 * A storage size in the largest unit that keeps it at or above 1.
 * @param {number} bytes
 * @returns {string} Such as "1.2 MB".
 */
export function formatBytes(bytes) {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  const shown = unit === 0 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
  return `${shown} ${units[unit]}`;
}

/**
 * What a review holds, leaving out a kind there is none of.
 * @param {{ due: number, new: number }} counts
 * @returns {string} Such as "3 due · 17 new today", or "" when there is nothing.
 */
export function describeQueue(counts) {
  const parts = [
    counts.due > 0 && `${counts.due} due`,
    counts.new > 0 && `${counts.new} new`,
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join(' · ')} today` : '';
}
