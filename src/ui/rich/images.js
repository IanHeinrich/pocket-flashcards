// @ts-check
import { h } from '../dom.js';

/** @typedef {import('../../core/types.js').Asset} Asset */
/** @typedef {(id: string) => Promise<Asset | null>} GetAsset */

/**
 * Fills each `img[data-asset]` under `root` with an object URL for the stored image.
 * An image that is no longer stored is replaced by a short notice.
 * @param {ParentNode} root
 * @param {GetAsset} getAsset
 * @returns {() => void} Revokes the object URLs, including any made after it is called.
 */
export function hydrateImages(root, getAsset) {
  /** @type {string[]} */
  const urls = [];
  let done = false;
  for (const img of root.querySelectorAll('img[data-asset]')) {
    const image = /** @type {HTMLImageElement} */ (img);
    const id = image.dataset.asset ?? '';
    getAsset(id)
      .then((asset) => {
        if (done) return;
        if (!asset) {
          image.replaceWith(missing(image.alt));
          return;
        }
        const url = URL.createObjectURL(asset.data);
        urls.push(url);
        image.src = url;
      })
      .catch(() => {
        if (!done) image.replaceWith(missing(image.alt));
      });
  }
  return () => {
    done = true;
    for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  };
}

/**
 * @param {string} alt
 * @returns {HTMLElement}
 */
function missing(alt) {
  return h('span', { class: 'img-missing' }, alt ? `Image not found: ${alt}` : 'Image not found');
}
