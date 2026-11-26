// @ts-check
import { markFencedLines } from './markdown.js';

/** @typedef {Map<string, string> | Record<string, string>} Lookup */

const IMAGE_REF =
  /!\[([^\]\n]*)\]\(\s*(?:<([^>\n]*)>|([^\s)]+))(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
const CODE_SPAN = /(`+)[^`\n]*?\1/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Normalises an image path so the same file is always written the same way:
 * forward slashes, no leading `./` or `/`, no doubled slashes, `%20`-style escapes decoded.
 * @param {string} path
 * @returns {string}
 */
export function normalizeAssetPath(path) {
  return decodeEscapes(path.trim())
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^(?:\.\/|\/)+/, '');
}

/**
 * Lists the relative image paths a Markdown text refers to, once each, in order.
 * Images inside code are skipped, as are remote, `data:` and `asset:` images.
 * @param {string} markdown
 * @returns {string[]}
 */
export function findImageRefs(markdown) {
  /** @type {Set<string>} */
  const refs = new Set();
  replaceImages(markdown, (_alt, ref) => {
    if (isRelative(ref)) refs.add(ref);
    return null;
  });
  return [...refs];
}

/**
 * Finds the imported file an image ref points to: the same normalised path first,
 * then the same file name ignoring case.
 * @param {string} ref
 * @param {readonly string[]} fileNames
 * @returns {string | null}
 */
export function matchAssetFile(ref, fileNames) {
  const path = normalizeAssetPath(ref);
  const exact = fileNames.find((name) => normalizeAssetPath(name) === path);
  if (exact !== undefined) return exact;
  const base = baseName(path).toLowerCase();
  return (
    fileNames.find((name) => baseName(normalizeAssetPath(name)).toLowerCase() === base) ?? null
  );
}

/**
 * Replaces relative image refs with `asset:<id>`, keeping the alt text.
 * @param {string} markdown
 * @param {Lookup} refToAssetId
 * @returns {string}
 */
export function rewriteImageRefs(markdown, refToAssetId) {
  return replaceImages(markdown, (alt, ref) => {
    const id = lookup(refToAssetId, ref);
    return id === undefined ? null : `![${alt}](asset:${id})`;
  });
}

/**
 * Turns `asset:<id>` image refs back into paths: the inverse of `rewriteImageRefs`.
 * @param {string} markdown
 * @param {Lookup} assetIdToPath
 * @returns {string}
 */
export function restoreImageRefs(markdown, assetIdToPath) {
  return replaceImages(markdown, (alt, ref) => {
    const id = /^asset:(.+)$/.exec(ref)?.[1];
    const path = id === undefined ? undefined : lookup(assetIdToPath, id);
    if (path === undefined) return null;
    return `![${alt}](${/[\s()<>]/.test(path) ? `<${path}>` : path})`;
  });
}

/**
 * Calls `replace` for every image outside code; a string return replaces that image.
 * @param {string} markdown
 * @param {(alt: string, ref: string) => string | null} replace
 * @returns {string}
 */
function replaceImages(markdown, replace) {
  const lines = markdown.split('\n');
  const fenced = markFencedLines(lines.map((line) => line.replace(/\r$/, '')));
  return lines
    .map((line, index) => (fenced[index] ? line : replaceOutsideCode(line, replace)))
    .join('\n');
}

/**
 * @param {string} line
 * @param {(alt: string, ref: string) => string | null} replace
 * @returns {string}
 */
function replaceOutsideCode(line, replace) {
  let result = '';
  let last = 0;
  for (const match of line.matchAll(CODE_SPAN)) {
    const index = match.index ?? 0;
    result += replaceInText(line.slice(last, index), replace) + match[0];
    last = index + match[0].length;
  }
  return result + replaceInText(line.slice(last), replace);
}

/**
 * @param {string} text
 * @param {(alt: string, ref: string) => string | null} replace
 * @returns {string}
 */
function replaceInText(text, replace) {
  return text.replace(IMAGE_REF, (match, alt, angled, plain) => {
    const ref = (angled ?? plain).trim();
    return replace(alt, ref) ?? match;
  });
}

/**
 * @param {string} ref
 * @returns {boolean}
 */
function isRelative(ref) {
  return ref !== '' && !SCHEME.test(ref) && !ref.startsWith('//') && !ref.startsWith('#');
}

/**
 * @param {string} path
 * @returns {string}
 */
function baseName(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Decodes runs of `%XX` escapes, leaving any run that is not valid UTF-8 as written.
 * @param {string} text
 * @returns {string}
 */
function decodeEscapes(text) {
  return text.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
}

/**
 * @param {Lookup} map
 * @param {string} key
 * @returns {string | undefined}
 */
function lookup(map, key) {
  if (map instanceof Map) return map.get(key);
  return Object.hasOwn(map, key) ? map[key] : undefined;
}
