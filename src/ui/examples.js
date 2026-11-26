// @ts-check

/** @typedef {import('../core/types.js').ImportSource} ImportSource */

const EXAMPLE_DECKS = [
  'examples/getting-started.md',
  'examples/world-capitals.md',
  'examples/chemistry-basics.md',
];
const EXAMPLE_IMAGES = ['examples/images/water-molecule.svg'];

/**
 * Fetches the example decks and their images from this site, ready for `previewImport`.
 * @returns {Promise<ImportSource[]>}
 */
export async function fetchExampleSources() {
  const decks = EXAMPLE_DECKS.map(async (path) => {
    const response = await fetchOk(path);
    /** @type {ImportSource} */
    const source = { kind: 'deck', name: fileName(path), text: await response.text() };
    return source;
  });
  const images = EXAMPLE_IMAGES.map(async (path) => {
    const response = await fetchOk(path);
    const data = await response.blob();
    /** @type {ImportSource} */
    const source = {
      kind: 'image',
      name: path.replace(/^examples\//, ''),
      type: data.type.split(';')[0] || 'image/svg+xml',
      data,
    };
    return source;
  });
  return Promise.all([...decks, ...images]);
}

/**
 * @param {string} path
 * @returns {Promise<Response>}
 */
async function fetchOk(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} could not be loaded (${response.status}).`);
  return response;
}

/**
 * @param {string} path
 * @returns {string}
 */
function fileName(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}
