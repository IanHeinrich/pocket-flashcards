// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeImport, describeQueue, formatBytes, plural } from '../../src/ui/format.js';

test('plural picks the noun for the count', () => {
  assert.equal(plural(0, 'card'), '0 cards');
  assert.equal(plural(1, 'card'), '1 card');
  assert.equal(plural(2, 'card'), '2 cards');
  assert.equal(plural(2, 'mouse', 'mice'), '2 mice');
});

test('describeImport names only what changed', () => {
  assert.equal(
    describeImport('Capitals', { added: 3, updated: 1, removed: 0 }),
    'Imported “Capitals”: 3 new, 1 updated.',
  );
  assert.equal(
    describeImport('Capitals', { added: 0, updated: 0, removed: 2 }),
    'Imported “Capitals”: 2 removed.',
  );
  assert.equal(
    describeImport('Capitals', { added: 0, updated: 0, removed: 0 }),
    '“Capitals” is already up to date.',
  );
});

test('formatBytes uses decimal units with one decimal place', () => {
  assert.equal(formatBytes(0), '0 bytes');
  assert.equal(formatBytes(999), '999 bytes');
  assert.equal(formatBytes(1500), '1.5 KB');
  assert.equal(formatBytes(2_000_000), '2 MB');
  assert.equal(formatBytes(3_450_000_000), '3.5 GB');
});

test('describeQueue leaves out a kind there is none of', () => {
  assert.equal(describeQueue({ due: 3, new: 17 }), '3 due · 17 new today');
  assert.equal(describeQueue({ due: 3, new: 0 }), '3 due today');
  assert.equal(describeQueue({ due: 0, new: 17 }), '17 new today');
  assert.equal(describeQueue({ due: 0, new: 0 }), '');
});
