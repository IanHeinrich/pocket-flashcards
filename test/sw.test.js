// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

/** App files the site never loads, so SHELL leaves them out. */
const NOT_SHIPPED = ['src/services/storage/memory-storage.js'];
const source = readFileSync(join(root, 'sw.js'), 'utf8');

/**
 * @param {string} dir Relative to the repository root.
 * @returns {string[]} Every file below it, as forward-slash paths relative to the root.
 */
function filesUnder(dir) {
  return readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
    .map((name) => join(dir, name))
    .filter((path) => statSync(join(root, path)).isFile())
    .map((path) => path.split(sep).join('/'));
}

/** @returns {string[]} */
function shellEntries() {
  const match = source.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(match, 'sw.js defines const SHELL = [...]');
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

test('sw.js has the VERSION line the deploy workflow stamps', () => {
  assert.ok(source.split(/\r?\n/).includes("const VERSION = 'dev';"));
});

test('SHELL lists every app file except NOT_SHIPPED', () => {
  const shell = new Set(shellEntries());
  const expected = [
    'index.html',
    'manifest.webmanifest',
    ...filesUnder('icons'),
    ...filesUnder('src').filter((path) => /\.(js|css)$/.test(path)),
  ].filter((path) => !NOT_SHIPPED.includes(path));
  const missing = expected.filter((path) => !shell.has(path));
  assert.deepEqual(missing, [], `add these to SHELL in sw.js: ${missing.join(', ')}`);
});

test('NOT_SHIPPED files exist and are left out of SHELL', () => {
  const shell = new Set(shellEntries());
  const absent = NOT_SHIPPED.filter((path) => !existsSync(join(root, path)));
  assert.deepEqual(absent, [], `remove these from NOT_SHIPPED: ${absent.join(', ')}`);
  const shipped = NOT_SHIPPED.filter((path) => shell.has(path));
  assert.deepEqual(shipped, [], `remove these from SHELL in sw.js: ${shipped.join(', ')}`);
});

test('every SHELL entry exists, once, and none is vendor/ or examples/', () => {
  const shell = shellEntries();
  const absent = shell.filter((path) => !existsSync(join(root, path)));
  assert.deepEqual(absent, [], `remove these from SHELL in sw.js: ${absent.join(', ')}`);
  assert.equal(new Set(shell).size, shell.length, 'SHELL has duplicates');
  assert.deepEqual(
    shell.filter((path) => /^(vendor|examples)\//.test(path)),
    [],
    'vendor/ and examples/ are cached on first use, not precached',
  );
});
