import { readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const fragmentsDir = join(root, 'changelog.d');
const changelogPath = join(root, 'CHANGELOG.md');
const HEADINGS = ['Added', 'Changed', 'Fixed', 'Removed'];

/** @returns {Promise<string[]>} fragment file names, sorted */
async function fragmentNames() {
  const names = await readdir(fragmentsDir);
  return names.filter((n) => n.endsWith('.md') && n !== 'README.md').sort();
}

/**
 * Splits a fragment into its bullets under each heading, and lists any problems.
 * @param {string} text
 * @returns {{ sections: Record<string, string[]>, problems: { line: number, message: string }[] }}
 */
function parseFragment(text) {
  /** @type {Record<string, string[]>} */
  const sections = {};
  /** @type {{ line: number, message: string }[]} */
  const problems = [];
  /** @type {string | null} */
  let current = null;
  let bullets = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (raw.trim() === '') return;
    const heading = /^###\s+(.*?)\s*$/.exec(raw);
    if (heading) {
      if (!HEADINGS.includes(heading[1])) {
        problems.push({
          line,
          message: `Heading "${heading[1]}" is not one of ${HEADINGS.join(', ')}.`,
        });
        current = null;
      } else {
        current = heading[1];
        sections[current] ??= [];
      }
      return;
    }
    if (raw.startsWith('- ')) {
      if (current === null) {
        problems.push({ line, message: 'A bullet needs a ### heading above it.' });
        return;
      }
      sections[current].push(raw.trimEnd());
      bullets += 1;
      return;
    }
    if (/^\s+\S/.test(raw) && current !== null && bullets > 0) {
      const list = sections[current];
      if (list.length > 0) {
        list[list.length - 1] += `\n${raw.trimEnd()}`;
        return;
      }
    }
    problems.push({ line, message: 'Expected a ### heading or a line starting with "- ".' });
  });
  if (bullets === 0 && problems.length === 0) {
    problems.push({ line: 1, message: 'The fragment has no bullets.' });
  }
  return { sections, problems };
}

async function check() {
  let failed = false;
  for (const name of await fragmentNames()) {
    const text = await readFile(join(fragmentsDir, name), 'utf8');
    for (const { line, message } of parseFragment(text).problems) {
      console.error(`changelog.d/${name}:${line}: ${message}`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
  console.log('Changelog fragments are valid.');
}

/**
 * Parses the body of the Unreleased section into bullets under each heading.
 * @param {string[]} lines
 * @returns {Record<string, string[]>}
 */
function parseUnreleased(lines) {
  /** @type {Record<string, string[]>} */
  const sections = {};
  /** @type {string | null} */
  let current = null;
  for (const raw of lines) {
    const heading = /^###\s+(.*?)\s*$/.exec(raw);
    if (heading) {
      current = heading[1];
      sections[current] ??= [];
    } else if (current !== null && raw.trim() !== '') {
      if (raw.startsWith('- ')) sections[current].push(raw.trimEnd());
      else if (sections[current].length > 0)
        sections[current][sections[current].length - 1] += `\n${raw.trimEnd()}`;
    }
  }
  return sections;
}

async function collect() {
  const names = await fragmentNames();
  /** @type {Record<string, string[]>} */
  const merged = Object.fromEntries(HEADINGS.map((h) => [h, []]));
  let failed = false;
  for (const name of names) {
    const { sections, problems } = parseFragment(await readFile(join(fragmentsDir, name), 'utf8'));
    for (const { line, message } of problems) {
      console.error(`changelog.d/${name}:${line}: ${message}`);
      failed = true;
    }
    for (const h of HEADINGS) merged[h].push(...(sections[h] ?? []));
  }
  if (failed) process.exit(1);
  if (names.length === 0) {
    console.log('No changelog fragments to collect.');
    return;
  }

  const lines = (await readFile(changelogPath, 'utf8')).split(/\r?\n/);
  let start = lines.findIndex((l) => /^##\s+Unreleased\s*$/i.test(l));
  if (start === -1) {
    const firstRelease = lines.findIndex((l) => /^##\s/.test(l));
    start = firstRelease === -1 ? lines.length : firstRelease;
    lines.splice(start, 0, '## Unreleased', '');
  }
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end === -1) end = lines.length;

  const existing = parseUnreleased(lines.slice(start + 1, end));
  const out = ['## Unreleased', ''];
  for (const h of [...HEADINGS, ...Object.keys(existing).filter((h) => !HEADINGS.includes(h))]) {
    const bullets = [...(existing[h] ?? []), ...(merged[h] ?? [])];
    if (bullets.length === 0) continue;
    out.push(`### ${h}`, '', ...bullets, '');
  }
  lines.splice(start, end - start, ...out);
  await writeFile(changelogPath, `${lines.join('\n').replace(/\n+$/, '')}\n`);

  for (const name of names) await unlink(join(fragmentsDir, name));
  console.log(`Folded ${names.length} fragment(s) into CHANGELOG.md.`);
}

const command = process.argv[2];
if (command === 'collect') await collect();
else if (command === 'check') await check();
else {
  console.error('Usage: node scripts/changelog.mjs collect | check');
  process.exit(1);
}
