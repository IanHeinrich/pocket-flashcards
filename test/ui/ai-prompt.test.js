// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AI_PROMPT } from '../../src/ui/ai-prompt.js';

test('the AI prompt is the one in docs/deck-format.md', () => {
  const docs = readFileSync(new URL('../../docs/deck-format.md', import.meta.url), 'utf8');
  const match = docs.replace(/\r\n/g, '\n').match(/````text\n([\s\S]*?)\n````/);
  assert.ok(match, 'docs/deck-format.md has a ````text block');
  assert.equal(AI_PROMPT, match[1]);
});
