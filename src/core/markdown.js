// @ts-check

/**
 * An open fenced code block.
 * @typedef {object} Fence
 * @property {string} char '`' or '~'.
 * @property {number} length How many fence characters opened the block.
 * @property {string} info The first word after the opening fence, such as `mermaid`.
 */

/**
 * @typedef {object} RenderedMarkdown
 * @property {string} html Safe HTML: every character of the input was escaped before formatting.
 * @property {string[]} mermaid Diagram sources, in the order of their `data-mermaid` index.
 */

/**
 * @typedef {object} RenderContext
 * @property {boolean} allowRemoteImages
 * @property {string[]} mermaid
 */

/**
 * @typedef {object} Slot
 * @property {string} html
 * @property {string} plain
 */

/**
 * @typedef {object} ListItem
 * @property {string[]} lines
 * @property {ParsedListItem[]} children
 */

/**
 * @typedef {object} ParsedListItem
 * @property {number} indent
 * @property {boolean} ordered
 * @property {number} number
 * @property {string} text
 */

/** @type {Record<string, string>} */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** @type {Record<string, string>} */
const UNESCAPES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

const HEADING = /^(#{3,6})[ \t]+(.+?)[ \t]*$/;
const RULE = /^ {0,3}(?:-{3,}|\*{3,})[ \t]*$/;
const QUOTE = /^ {0,3}&gt;(?: |$)/;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}\.)[ \t]+(.*)$/;
const CODE_SPAN = /`([^`\n]+)`/g;
const SLOT_OPEN = String.fromCharCode(0xe000);
const SLOT_CLOSE = String.fromCharCode(0xe001);
// A URL never holds a slot placeholder: restoring one inside an href or src would put
// markup into an attribute value. A construct with such a URL stays escaped text.
const SLOT_CHARS = SLOT_OPEN + SLOT_CLOSE;
const ANGLED_URL = '&lt;([^\\n' + SLOT_CHARS + ']*?)&gt;';
const PLAIN_URL = '([^\\s()' + SLOT_CHARS + ']+)';
const URL_TITLE = '(?:\\s+(?:&quot;[^\\n]*?&quot;|&#39;[^\\n]*?&#39;))?';
const IMAGE = new RegExp(
  '!\\[([^[\\]]*)\\]\\((?:' + ANGLED_URL + '|' + PLAIN_URL + ')' + URL_TITLE + '\\)',
  'g',
);
const LINK = new RegExp('\\[([^[\\]]+)\\]\\(' + PLAIN_URL + URL_TITLE + '\\)', 'g');
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);
const SLOT = new RegExp(SLOT_OPEN + '([0-9]+)' + SLOT_CLOSE, 'g');
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/=]+$/i;
const ALLOWED_LINK = /^(?:https?:|mailto:)/i;

/**
 * Reads a line as the opening of a fenced code block: three or more backticks or tildes.
 * @param {string} line
 * @returns {Fence | null}
 */
export function openingFence(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;
  const [, marker, rest] = match;
  if (marker[0] === '`' && rest.includes('`')) return null;
  return { char: marker[0], length: marker.length, info: rest.trim().split(/\s+/)[0] };
}

/**
 * @param {string} line
 * @param {Fence} fence
 * @returns {boolean} True when the line closes the open fence.
 */
export function closesFence(line, fence) {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return match !== null && match[1][0] === fence.char && match[1].length >= fence.length;
}

/**
 * Marks each line that is a fence line or inside a fenced code block.
 * @param {readonly string[]} lines
 * @returns {boolean[]}
 */
export function markFencedLines(lines) {
  /** @type {Fence | null} */
  let fence = null;
  return lines.map((line) => {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      return true;
    }
    fence = openingFence(line);
    return fence !== null;
  });
}

/**
 * Renders the safe Markdown subset of a card side to HTML.
 * @param {string} text
 * @param {{ allowRemoteImages?: boolean }} [options]
 * @returns {RenderedMarkdown}
 */
export function renderMarkdown(text, { allowRemoteImages = false } = {}) {
  /** @type {RenderContext} */
  const context = { allowRemoteImages, mermaid: [] };
  const clean = text
    .replaceAll(SLOT_OPEN, REPLACEMENT_CHAR)
    .replaceAll(SLOT_CLOSE, REPLACEMENT_CHAR)
    .replace(/\r\n?/g, '\n');
  const html = renderBlocks(escapeHtml(clean).split('\n'), context);
  return { html, mermaid: context.mermaid };
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * @param {string} text
 * @returns {string}
 */
function unescapeHtml(text) {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => UNESCAPES[name]);
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isBlank(line) {
  return line.trim() === '';
}

/** @typedef {(lines: string[], start: number, context: RenderContext) => { html: string, next: number } | null} BlockRule */

/**
 * @param {string[]} lines Escaped lines.
 * @param {RenderContext} context
 * @returns {string}
 */
function renderBlocks(lines, context) {
  /** @type {BlockRule[]} */
  const rules = [readFence, readHeading, readRule, readQuote, readList, readParagraph];
  /** @type {string[]} */
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    if (isBlank(lines[index])) {
      index++;
      continue;
    }
    for (const rule of rules) {
      const block = rule(lines, index, context);
      if (block) {
        blocks.push(block.html);
        index = block.next;
        break;
      }
    }
  }
  return blocks.join('\n');
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function startsBlock(line) {
  return (
    openingFence(line) !== null ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    parseListItem(line) !== null
  );
}

/** @type {BlockRule} */
function readFence(lines, start, context) {
  const fence = openingFence(lines[start]);
  if (!fence) return null;
  let end = start + 1;
  while (end < lines.length && !closesFence(lines[end], fence)) end++;
  const content = lines.slice(start + 1, end).join('\n');
  return { html: renderFence(content, fence.info, context), next: end + 1 };
}

/**
 * @param {string} content Escaped.
 * @param {string} info Escaped.
 * @param {RenderContext} context
 * @returns {string}
 */
function renderFence(content, info, context) {
  if (info === 'mermaid') {
    const index = context.mermaid.length;
    context.mermaid.push(unescapeHtml(content));
    return `<div class="mermaid-block" data-mermaid="${index}"><pre>${content}</pre></div>`;
  }
  const language = /^[\w+-]+$/.test(info) ? ` class="language-${info}"` : '';
  return `<pre><code${language}>${content}</code></pre>`;
}

/** @type {BlockRule} */
function readHeading(lines, start, context) {
  const match = HEADING.exec(lines[start]);
  if (!match) return null;
  const level = match[1].length;
  return { html: `<h${level}>${renderInline(match[2], context)}</h${level}>`, next: start + 1 };
}

/** @type {BlockRule} */
function readRule(lines, start) {
  return RULE.test(lines[start]) ? { html: '<hr>', next: start + 1 } : null;
}

/** @type {BlockRule} */
function readQuote(lines, start, context) {
  let end = start;
  while (end < lines.length && QUOTE.test(lines[end])) end++;
  if (end === start) return null;
  const inner = lines.slice(start, end).map((line) => line.replace(/^ {0,3}&gt; ?/, ''));
  return { html: `<blockquote>${renderBlocks(inner, context)}</blockquote>`, next: end };
}

/**
 * @param {string} line
 * @returns {ParsedListItem | null}
 */
function parseListItem(line) {
  const match = LIST_ITEM.exec(line);
  if (!match) return null;
  const [, indent, marker, text] = match;
  const ordered = /\d/.test(marker[0]);
  return { indent: indent.length, ordered, number: ordered ? parseInt(marker, 10) : 1, text };
}

/** @type {BlockRule} */
function readList(lines, start, context) {
  const first = parseListItem(lines[start]);
  if (!first) return null;
  const nestedIndent = first.indent + 2;
  /** @type {ListItem[]} */
  const items = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line)) {
      let next = index;
      while (next < lines.length && isBlank(lines[next])) next++;
      const item = next < lines.length ? parseListItem(lines[next]) : null;
      if (!item || (item.indent < nestedIndent && item.ordered !== first.ordered)) break;
      index = next;
      continue;
    }
    const item = parseListItem(line);
    if (item && item.indent >= nestedIndent && items.length > 0) {
      items[items.length - 1].children.push(item);
    } else if (item && item.indent < nestedIndent && item.ordered === first.ordered) {
      items.push({ lines: [item.text], children: [] });
    } else if (!item && /^\s{2,}\S/.test(line) && items.length > 0 && !startsBlock(line.trim())) {
      appendContinuation(items[items.length - 1], line.trim());
    } else {
      break;
    }
    index++;
  }
  return { html: renderList(first, items, context), next: index };
}

/**
 * @param {ListItem} item
 * @param {string} text
 */
function appendContinuation(item, text) {
  const lastChild = item.children[item.children.length - 1];
  if (lastChild) lastChild.text += '\n' + text;
  else item.lines.push(text);
}

/**
 * @param {ParsedListItem} first
 * @param {ListItem[]} items
 * @param {RenderContext} context
 * @returns {string}
 */
function renderList(first, items, context) {
  const body = items
    .map((item) => {
      const nested = item.children.length > 0 ? renderNestedList(item.children, context) : '';
      return `<li>${renderInlineLines(item.lines, context)}${nested}</li>`;
    })
    .join('');
  return wrapList(first, body);
}

/**
 * @param {ParsedListItem[]} children
 * @param {RenderContext} context
 * @returns {string}
 */
function renderNestedList(children, context) {
  const body = children
    .map((child) => `<li>${renderInlineLines(child.text.split('\n'), context)}</li>`)
    .join('');
  return wrapList(children[0], body);
}

/**
 * @param {ParsedListItem} first
 * @param {string} body
 * @returns {string}
 */
function wrapList(first, body) {
  if (!first.ordered) return `<ul>${body}</ul>`;
  const start = first.number === 1 ? '' : ` start="${first.number}"`;
  return `<ol${start}>${body}</ol>`;
}

/** @type {BlockRule} */
function readParagraph(lines, start, context) {
  let end = start + 1;
  while (end < lines.length && !isBlank(lines[end]) && !startsBlock(lines[end])) end++;
  const paragraph = lines.slice(start, end).map((line) => line.trim());
  return { html: `<p>${renderInlineLines(paragraph, context)}</p>`, next: end };
}

/**
 * @param {string[]} lines
 * @param {RenderContext} context
 * @returns {string}
 */
function renderInlineLines(lines, context) {
  return renderInline(lines.join('\n'), context).replace(/\n/g, '<br>');
}

/**
 * Formats inline Markdown in escaped text. Code, images and links are set aside in
 * numbered slots first so that emphasis never reaches inside them.
 * @param {string} text Escaped.
 * @param {RenderContext} context
 * @returns {string}
 */
function renderInline(text, context) {
  /** @type {Slot[]} */
  const slots = [];
  /**
   * @param {string} html
   * @param {string} plain
   */
  const stash = (html, plain) => {
    slots.push({ html, plain });
    return SLOT_OPEN + (slots.length - 1) + SLOT_CLOSE;
  };
  const formatted = text
    .replace(CODE_SPAN, (_, code) => stash(`<code>${code}</code>`, code))
    .replace(IMAGE, (_, alt, angled, plain) => {
      const url = unescapeHtml(angled ?? plain);
      return stash(renderImage(toPlain(alt, slots), url, context.allowRemoteImages), '');
    })
    .replace(LINK, (_, label, url) => {
      const labelHtml = formatEmphasis(label);
      return stash(renderLink(labelHtml, unescapeHtml(url)), toPlain(label, slots));
    });
  return restoreSlots(formatEmphasis(formatted), slots);
}

/**
 * @param {string} text
 * @param {Slot[]} slots
 * @returns {string}
 */
function toPlain(text, slots) {
  return text.replace(SLOT, (_, index) => slots[Number(index)].plain);
}

/**
 * @param {string} text
 * @param {Slot[]} slots
 * @returns {string}
 */
function restoreSlots(text, slots) {
  return text.replace(SLOT, (_, index) => restoreSlots(slots[Number(index)].html, slots));
}

/**
 * @param {string} alt Escaped.
 * @param {string} url Unescaped.
 * @param {boolean} allowRemoteImages
 * @returns {string}
 */
function renderImage(alt, url, allowRemoteImages) {
  const asset = /^asset:([\w-]+)$/.exec(url);
  if (asset) return `<img data-asset="${asset[1]}" alt="${alt}">`;
  if (SAFE_DATA_IMAGE.test(url)) return `<img src="${escapeHtml(url)}" alt="${alt}">`;
  if (/^https:\/\//i.test(url)) {
    if (allowRemoteImages) return `<img src="${escapeHtml(url)}" alt="${alt}">`;
    return `<span class="img-blocked">Remote image blocked: ${alt}</span>`;
  }
  return `<span class="img-missing">Missing image: ${alt}</span>`;
}

/**
 * @param {string} labelHtml
 * @param {string} url Unescaped.
 * @returns {string} A link, or only its label when the scheme is not allowed.
 */
function renderLink(labelHtml, url) {
  if (!ALLOWED_LINK.test(url)) return labelHtml;
  const href = escapeHtml(url);
  return `<a href="${href}" rel="noopener noreferrer" target="_blank">${labelHtml}</a>`;
}

/**
 * @param {string} text Escaped.
 * @returns {string}
 */
function formatEmphasis(text) {
  return text
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?=[^\s*])([^*\n]*?[^\s*])\*/g, '<em>$1</em>')
    .replace(/(^|[^\p{L}\p{N}_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>');
}
