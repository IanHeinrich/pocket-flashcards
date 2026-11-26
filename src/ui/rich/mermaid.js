// @ts-check
import { h } from '../dom.js';

const MERMAID_URL = 'vendor/mermaid.min.js';
const WEB_IMAGE_NOTE = 'This diagram uses an image from the web, which isn’t allowed.';

/**
 * Config keys a diagram's own `%%{init}%%` directive may not change: Mermaid's defaults,
 * plus the theme keys that can carry CSS, and so a `url(...)`, into the drawing.
 */
const SECURE_KEYS = [
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'suppressErrorRendering',
  'maxEdges',
  'themeCSS',
  'themeVariables',
  'fontFamily',
  'altFontFamily',
];

/** An `img:` or `icon:` key, bare or quoted, and the space and quote before its value. */
const IMAGE_KEY = /\b(?:img|icon)["']?\s*:\s*["']?\s*/gi;

/** The `\xHH`, `\uHHHH` and `\UHHHHHHHH` escapes a quoted YAML key may use. */
const ESCAPE = /\\(?:x([0-9a-f]{2})|u([0-9a-f]{4})|U([0-9a-f]{8}))/gi;

/**
 * The part of the Mermaid API the app uses.
 * @typedef {object} MermaidApi
 * @property {(config: Record<string, unknown>) => void} initialize
 * @property {(id: string, source: string) => Promise<{ svg: string }>} render
 */

/** @type {Promise<MermaidApi> | null} */
let loading = null;
/** The config last given to `mermaid.initialize`, as JSON, so a theme change re-initialises. */
/** @type {string | null} */
let initializedConfig = null;

/** Mermaid theme variables and the app colour token each one takes. */
const THEME_TOKENS = {
  background: '--color-surface-raised',
  primaryColor: '--color-surface-2',
  primaryBorderColor: '--color-border-strong',
  primaryTextColor: '--color-text',
  secondaryColor: '--color-surface',
  tertiaryColor: '--color-surface',
  lineColor: '--color-text-muted',
  textColor: '--color-text',
  edgeLabelBackground: '--color-surface-raised',
  clusterBkg: '--color-surface',
  clusterBorder: '--color-border',
  noteBkgColor: '--color-surface-2',
  noteBorderColor: '--color-border-strong',
  noteTextColor: '--color-text',
};
let counter = 0;

/**
 * Loads the vendored Mermaid build once, on first use.
 * @returns {Promise<MermaidApi>}
 */
function loadMermaid() {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = h('script', { attrs: { src: MERMAID_URL } });
      script.addEventListener('load', () => {
        const api = /** @type {{ mermaid?: MermaidApi }} */ (/** @type {unknown} */ (globalThis))
          .mermaid;
        if (api) resolve(api);
        else reject(new Error('Mermaid did not load.'));
      });
      script.addEventListener('error', () => reject(new Error('Mermaid could not be loaded.')));
      document.head.append(script);
    });
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/**
 * True when the page is drawn in its dark theme.
 * @returns {boolean}
 */
export function isDarkTheme() {
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * True when a diagram names an image by `img:` or `icon:` with anything but a `data:`
 * URI. Mermaid would fetch such an image itself, so the diagram is not drawn.
 * @param {string} source
 * @returns {boolean}
 */
export function usesWebImage(source) {
  const text = source.replace(ESCAPE, (escape, x, u, U) => {
    const code = parseInt(x ?? u ?? U, 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : escape;
  });
  for (const match of text.matchAll(IMAGE_KEY)) {
    const value = text.slice((match.index ?? 0) + match[0].length);
    if (!/^data:/i.test(value)) return true;
  }
  return false;
}

/**
 * The CSS `max-width` for a drawn diagram: its natural width from the SVG's `viewBox`,
 * but never wider than the card. Mermaid's own sizing either overflows a phone or, once
 * capped at 100%, stretches a small diagram to fill the card.
 * @param {string | null} viewBox
 * @returns {string}
 */
export function diagramMaxWidth(viewBox) {
  const width = Number(viewBox?.trim().split(/[\s,]+/)[2]);
  return Number.isFinite(width) && width > 0 ? `min(100%, ${Math.ceil(width)}px)` : '100%';
}

/**
 * Draws every `.mermaid-block` under `root`. A block that fails, or that uses an image
 * from the web, keeps its source and gets a short note.
 * @param {ParentNode} root
 * @param {readonly string[]} sources Diagram sources by `data-mermaid` index.
 * @param {() => boolean} isCancelled Stops drawing into a card that has gone.
 * @returns {Promise<void>}
 */
export async function renderDiagrams(root, sources, isCancelled) {
  /** @type {{ block: HTMLElement, source: string }[]} */
  const diagrams = [];
  for (const element of root.querySelectorAll('.mermaid-block')) {
    const block = /** @type {HTMLElement} */ (element);
    const source = sources[Number(block.dataset.mermaid)];
    if (source === undefined) continue;
    if (usesWebImage(source)) markFailed(block, WEB_IMAGE_NOTE);
    else diagrams.push({ block, source });
  }
  if (diagrams.length === 0) return;
  /** @type {MermaidApi} */
  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch {
    if (!isCancelled()) diagrams.forEach(({ block }) => markFailed(block));
    return;
  }
  const config = {
    startOnLoad: false,
    securityLevel: 'strict',
    secure: SECURE_KEYS,
    theme: 'base',
    themeVariables: appThemeVariables(),
  };
  const key = JSON.stringify(config);
  if (initializedConfig !== key) {
    mermaid.initialize(config);
    initializedConfig = key;
  }
  for (const { block, source } of diagrams) {
    if (isCancelled()) return;
    const id = `pf-mermaid-${++counter}`;
    try {
      const { svg } = await mermaid.render(id, source);
      if (isCancelled()) return;
      const drawn = parseSvg(svg);
      if (!drawn) throw new Error('Mermaid returned no diagram.');
      drawn.style.maxWidth = diagramMaxWidth(drawn.getAttribute('viewBox'));
      block.replaceChildren(drawn);
      block.classList.add('is-drawn');
    } catch {
      if (!isCancelled()) markFailed(block);
    } finally {
      // Mermaid can leave its scratch elements in the page; the drawn SVG keeps the id.
      for (const stray of [document.getElementById(id), document.getElementById(`d${id}`)]) {
        if (stray && !block.contains(stray)) stray.remove();
      }
    }
  }
}

/**
 * Mermaid's `base` theme coloured from the app's tokens, so a diagram matches the card in
 * the light and the dark theme. Custom properties hold `light-dark()` pairs, so each is
 * resolved through a hidden element to the colour in use now.
 * @returns {Record<string, string | boolean>}
 */
function appThemeVariables() {
  const probe = h('span', { attrs: { hidden: true } });
  document.body.append(probe);
  /** @type {Record<string, string | boolean>} */
  const variables = {
    darkMode: isDarkTheme(),
    // Mermaid's default shadow is a light grey that glows on the dark theme.
    dropShadow: 'none',
    fontFamily: getComputedStyle(document.body).fontFamily,
  };
  for (const [name, token] of Object.entries(THEME_TOKENS)) {
    probe.style.color = `var(${token})`;
    variables[name] = getComputedStyle(probe).color;
  }
  probe.remove();
  return variables;
}

/**
 * Turns Mermaid's SVG markup into an element without assigning `innerHTML`.
 * Mermaid sanitises its own output under `securityLevel: 'strict'`, and a parsed
 * document never runs scripts.
 * @param {string} svg
 * @returns {SVGSVGElement | null}
 */
function parseSvg(svg) {
  const doc = new DOMParser().parseFromString(svg, 'text/html');
  const element = doc.body.querySelector('svg');
  return element ? document.importNode(element, true) : null;
}

/**
 * @param {HTMLElement} block
 * @param {string} [note]
 */
function markFailed(block, note = 'Diagram could not be drawn') {
  if (block.querySelector('.mermaid-error')) return;
  block.append(h('p', { class: 'mermaid-error' }, note));
}

/**
 * Fetches the Mermaid build so the service worker keeps a copy for offline use.
 * @returns {Promise<void>}
 */
export async function prefetchMermaid() {
  try {
    await fetch(MERMAID_URL);
  } catch {
    // Offline or blocked: the diagrams will load on first view instead.
  }
}
