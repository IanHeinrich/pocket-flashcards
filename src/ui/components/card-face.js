// @ts-check
import { renderMarkdown } from '../../core/markdown.js';
import { hydrateImages } from '../rich/images.js';
import { renderDiagrams } from '../rich/mermaid.js';

/** @typedef {import('../rich/images.js').GetAsset} GetAsset */

/**
 * @typedef {object} CardFaceOptions
 * @property {boolean} allowRemoteImages
 * @property {GetAsset} getAsset
 */

/**
 * Renders one side of a card into `container` and draws its images and diagrams.
 * This is the only place in the app that assigns `innerHTML`, and only with the
 * output of `core/markdown.js`, which escapes the text before formatting it.
 * @param {HTMLElement} container
 * @param {string} markdown
 * @param {CardFaceOptions} options
 * @returns {() => void} Stops drawing and revokes image URLs.
 */
export function renderCardFace(container, markdown, { allowRemoteImages, getAsset }) {
  const { html, mermaid } = renderMarkdown(markdown, { allowRemoteImages });
  container.classList.add('card-face');
  container.innerHTML = html;
  const releaseImages = hydrateImages(container, getAsset);
  let cancelled = false;
  if (mermaid.length > 0) void renderDiagrams(container, mermaid, () => cancelled);
  return () => {
    cancelled = true;
    releaseImages();
  };
}
