import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 8080;
const host = 'localhost';

const TEXT = 'charset=utf-8';
/** @type {Record<string, string>} */
const types = {
  '.html': `text/html; ${TEXT}`,
  '.js': `text/javascript; ${TEXT}`,
  '.mjs': `text/javascript; ${TEXT}`,
  '.css': `text/css; ${TEXT}`,
  '.json': `application/json; ${TEXT}`,
  '.webmanifest': `application/manifest+json; ${TEXT}`,
  '.svg': `image/svg+xml; ${TEXT}`,
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': `text/markdown; ${TEXT}`,
  '.txt': `text/plain; ${TEXT}`,
  '.map': `application/json; ${TEXT}`,
};

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} message
 */
function sendText(res, status, message) {
  res.writeHead(status, { 'Content-Type': `text/plain; ${TEXT}`, 'Cache-Control': 'no-cache' });
  res.end(message);
}

/**
 * Maps a request URL to a file path inside the root, or null if it escapes the root.
 * @param {string} rawUrl
 * @returns {string | null}
 */
function resolveInsideRoot(rawUrl) {
  let pathname;
  try {
    // The URL parser would quietly fold "/../" away, so look at the raw path first.
    const rawPath = decodeURIComponent(rawUrl.split(/[?#]/)[0]);
    if (rawPath.split(/[\\/]/).includes('..')) return null;
    pathname = decodeURIComponent(new URL(rawUrl, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  const target = resolve(join(root, pathname));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed');
    return;
  }
  const target = resolveInsideRoot(req.url ?? '/');
  if (target === null) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  try {
    let file = target;
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    sendText(res, 404, 'Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Pocket Flashcards is running at http://${host}:${port}/`);
});
