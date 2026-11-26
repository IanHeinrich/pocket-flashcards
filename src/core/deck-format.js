// @ts-check
import { normalizeDeckName, normalizeText } from './ids.js';
import { markFencedLines } from './markdown.js';

/** @typedef {import('./types.js').DeckMeta} DeckMeta */
/** @typedef {import('./types.js').ParsedCard} ParsedCard */
/** @typedef {import('./types.js').ParsedDeck} ParsedDeck */
/** @typedef {import('./types.js').ParseProblem} ParseProblem */

/**
 * @typedef {object} Problems
 * @property {ParseProblem[]} errors
 * @property {ParseProblem[]} warnings
 */

/**
 * @typedef {object} FrontMatter
 * @property {number} bodyStart Index of the first line after the front matter.
 * @property {string} [deck]
 * @property {string[]} [tags]
 * @property {string} [description]
 */

/**
 * @typedef {object} Source
 * @property {string[]} lines
 * @property {boolean[]} fenced Per line: a fence line or inside a fenced code block.
 */

const BOM = String.fromCharCode(0xfeff);
const CARD_HEADING = /^## (?!#)/;
const DECK_HEADING = /^# (?!#)(.*)$/;
const REVERSIBLE = /^(.*?)\s*<->\s*(.*)$/;
const FRONT_MATTER_LINE = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/;
const NO_NAME = 'This deck has no name. Add a `deck:` line in front matter or a `# Name` heading.';

/**
 * Parses a deck file. Problems are collected with their line numbers, never thrown.
 * @param {string} text
 * @param {{ fallbackName?: string }} [options] `fallbackName` is usually the file name.
 * @returns {ParsedDeck}
 */
export function parseDeck(text, { fallbackName } = {}) {
  const lines = (text.startsWith(BOM) ? text.slice(1) : text).split(/\r?\n/);
  /** @type {Problems} */
  const problems = { errors: [], warnings: [] };
  const frontMatter = readFrontMatter(lines, problems.warnings);
  const fenced = [
    ...lines.slice(0, frontMatter.bodyStart).map(() => false),
    ...markFencedLines(lines.slice(frontMatter.bodyStart)),
  ];
  const source = { lines, fenced };
  const headings = findCardHeadings(source, frontMatter.bodyStart);
  const name = resolveName([
    frontMatter.deck,
    findDeckHeading(source, frontMatter.bodyStart, headings[0] ?? lines.length),
    fallbackName?.replace(/\.md$/i, ''),
  ]);
  if (!name) problems.errors.push({ line: 0, message: NO_NAME });
  const cards = dropDuplicates(
    headings.flatMap((start, index) =>
      readCard(source, start, headings[index + 1] ?? lines.length, problems),
    ),
    problems.warnings,
  );
  if (cards.length === 0) {
    problems.warnings.push({
      line: 0,
      message: 'This deck has no cards. Start each card with a `## ` heading.',
    });
  }
  return { meta: buildMeta(name, frontMatter), cards, ...problems };
}

/**
 * Writes a deck file that `parseDeck` reads back to the same meta and cards.
 * @param {DeckMeta} meta
 * @param {readonly { front: string, back: string }[]} cards
 * @returns {string}
 */
export function serializeDeck(meta, cards) {
  const header = ['---', `deck: ${quoteValue(meta.name)}`];
  if (meta.tags.length > 0) header.push(`tags: [${meta.tags.map(quoteTag).join(', ')}]`);
  if (meta.description) {
    header.push(`description: ${quoteValue(meta.description.replace(/\s*\n\s*/g, ' '))}`);
  }
  header.push('---');
  return [header.join('\n'), ...cards.map(serializeCard)].join('\n\n') + '\n';
}

/**
 * @param {string[]} lines
 * @param {ParseProblem[]} warnings
 * @returns {FrontMatter}
 */
function readFrontMatter(lines, warnings) {
  if (lines[0]?.trim() !== '---') return { bodyStart: 0 };
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (close === -1) {
    warnings.push({
      line: 1,
      message: 'The front matter has no closing `---` line, so it was ignored.',
    });
    return { bodyStart: 0 };
  }
  /** @type {FrontMatter} */
  const frontMatter = { bodyStart: close + 1 };
  for (let index = 1; index < close; index++) {
    readFrontMatterLine(lines[index], index + 1, frontMatter, warnings);
  }
  return frontMatter;
}

/**
 * @param {string} line
 * @param {number} lineNumber
 * @param {FrontMatter} frontMatter Filled in place; it is built by `readFrontMatter`.
 * @param {ParseProblem[]} warnings
 */
function readFrontMatterLine(line, lineNumber, frontMatter, warnings) {
  if (line.trim() === '' || line.trim().startsWith('#')) return;
  const match = FRONT_MATTER_LINE.exec(line.trim());
  if (!match) {
    warnings.push({
      line: lineNumber,
      message: 'This front matter line is not in `key: value` form, so it was ignored.',
    });
    return;
  }
  const key = match[1].toLowerCase();
  const value = match[2].trim();
  if (key === 'deck') frontMatter.deck = unquote(value);
  else if (key === 'description') frontMatter.description = unquote(value);
  else if (key === 'tags') frontMatter.tags = parseTags(value);
  else {
    warnings.push({
      line: lineNumber,
      message: `Unknown front matter key "${match[1]}" was ignored. Use deck, tags or description.`,
    });
  }
}

/**
 * Reads `[a, b]`, `a, b` or quoted items.
 * @param {string} value
 * @returns {string[]}
 */
function parseTags(value) {
  const bracketed = /^\[(.*)\]$/.exec(value);
  let rest = (bracketed ? bracketed[1] : value).trim();
  /** @type {string[]} */
  const tags = [];
  while (rest) {
    const quoted = /^(["'])(.*?)\1\s*(?:,|$)/.exec(rest);
    const comma = rest.indexOf(',');
    if (quoted) {
      tags.push(quoted[2]);
      rest = rest.slice(quoted[0].length).trim();
    } else {
      tags.push(comma === -1 ? rest : rest.slice(0, comma));
      rest = comma === -1 ? '' : rest.slice(comma + 1).trim();
    }
  }
  return tags.map((tag) => tag.trim()).filter(Boolean);
}

/**
 * @param {string} value
 * @returns {string}
 */
function unquote(value) {
  return /^(["'])(.*)\1$/.exec(value)?.[2] ?? value;
}

/**
 * @param {Source} source
 * @param {number} bodyStart
 * @returns {number[]} Line indexes of card headings.
 */
function findCardHeadings({ lines, fenced }, bodyStart) {
  /** @type {number[]} */
  const headings = [];
  for (let index = bodyStart; index < lines.length; index++) {
    if (!fenced[index] && CARD_HEADING.test(lines[index])) headings.push(index);
  }
  return headings;
}

/**
 * @param {Source} source
 * @param {number} from
 * @param {number} to
 * @returns {string | undefined} The text of the first `# Name` line in the range.
 */
function findDeckHeading({ lines, fenced }, from, to) {
  for (let index = from; index < to; index++) {
    const match = fenced[index] ? null : DECK_HEADING.exec(lines[index]);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * @param {(string | undefined)[]} candidates In order of precedence.
 * @returns {string} The first candidate that is not empty once normalised, or ''.
 */
function resolveName(candidates) {
  for (const candidate of candidates) {
    const name = candidate === undefined ? '' : normalizeDeckName(candidate);
    if (name) return name;
  }
  return '';
}

/**
 * @param {string} name
 * @param {FrontMatter} frontMatter
 * @returns {DeckMeta}
 */
function buildMeta(name, frontMatter) {
  /** @type {DeckMeta} */
  const meta = { name, tags: frontMatter.tags ?? [] };
  if (frontMatter.description) meta.description = frontMatter.description;
  return meta;
}

/**
 * @param {Source} source
 * @param {number} start Index of the card's heading line.
 * @param {number} end Index of the next card's heading, or the line count.
 * @param {Problems} problems
 * @returns {ParsedCard[]} No card when the heading is empty, two for a `<->` card.
 */
function readCard({ lines, fenced }, start, end, problems) {
  const line = start + 1;
  const heading = lines[start].slice(3).trim();
  if (!heading) {
    problems.errors.push({
      line,
      message: 'This card has no text after `## `, so it was skipped. Write the front there.',
    });
    return [];
  }
  const body = lines.slice(start + 1, end);
  const reversible = REVERSIBLE.exec(heading);
  if (reversible && reversible[1] && reversible[2]) {
    if (joinTrimmed(body) === '') {
      return [
        { front: reversible[1], back: reversible[2], line },
        { front: reversible[2], back: reversible[1], line },
      ];
    }
    problems.warnings.push({
      line,
      message: 'This card has text below its heading, so `<->` was ignored and it is one card.',
    });
  }
  const divider = body.findIndex(
    (text, index) => !fenced[start + 1 + index] && text.trim() === '---',
  );
  const card =
    divider === -1 ? splitAtHeading(heading, body) : splitAtDivider(heading, body, divider);
  if (card.back === '') {
    problems.warnings.push({
      line,
      message: 'Card has no answer. Write the back on the lines below its heading.',
    });
  }
  return [{ ...card, line }];
}

/**
 * @param {string} heading
 * @param {string[]} body
 * @returns {{ front: string, back: string }}
 */
function splitAtHeading(heading, body) {
  return { front: heading, back: joinTrimmed(body) };
}

/**
 * @param {string} heading
 * @param {string[]} body
 * @param {number} divider Index in `body` of the `---` line.
 * @returns {{ front: string, back: string }}
 */
function splitAtDivider(heading, body, divider) {
  const above = joinTrimmed(body.slice(0, divider));
  return {
    front: above ? `${heading}\n\n${above}` : heading,
    back: joinTrimmed(body.slice(divider + 1)),
  };
}

/**
 * @param {string[]} lines
 * @returns {string}
 */
function joinTrimmed(lines) {
  return lines.join('\n').trim();
}

/**
 * Keeps the first card for each normalised front and warns about the rest.
 * @param {ParsedCard[]} cards
 * @param {ParseProblem[]} warnings
 * @returns {ParsedCard[]}
 */
function dropDuplicates(cards, warnings) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  return cards.filter((card) => {
    const key = normalizeText(card.front);
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, card.line);
      return true;
    }
    warnings.push({
      line: card.line,
      message: `The cards on lines ${first} and ${card.line} have the same front. Only the one on line ${first} is kept.`,
    });
    return false;
  });
}

/**
 * @param {{ front: string, back: string }} card
 * @returns {string}
 */
function serializeCard({ front, back }) {
  const [heading, ...rest] = front.split('\n');
  const frontBody = rest.join('\n').trim();
  const parts = [`## ${heading.trim()}`];
  if (frontBody) parts.push(frontBody);
  if (frontBody || hasDivider(back)) parts.push('---');
  if (back.trim()) parts.push(back.trim());
  return parts.join('\n\n');
}

/**
 * @param {string} text
 * @returns {boolean} True when a line outside code is exactly `---`.
 */
function hasDivider(text) {
  const lines = text.split('\n');
  const fenced = markFencedLines(lines);
  return lines.some((line, index) => !fenced[index] && line.trim() === '---');
}

/**
 * @param {string} value
 * @returns {string}
 */
function quoteValue(value) {
  return /^["']/.test(value) ? `"${value}"` : value;
}

/**
 * @param {string} tag
 * @returns {string}
 */
function quoteTag(tag) {
  if (!/^["']|[,[\]]/.test(tag)) return tag;
  return tag.includes('"') ? `'${tag}'` : `"${tag}"`;
}
