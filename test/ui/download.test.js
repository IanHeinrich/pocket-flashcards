// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupFileName, deckFileName } from '../../src/ui/download.js';

test('deckFileName replaces characters file systems refuse', () => {
  assert.equal(deckFileName('Science / Chemistry basics', '.md'), 'Science - Chemistry basics.md');
  assert.equal(deckFileName('What? <Why>: "this"', '.md'), 'What - Why - this.md');
  assert.equal(deckFileName('a\u0000b\u001fc', '.md'), 'abc.md');
});

test('deckFileName never gives an empty or hidden name', () => {
  assert.equal(deckFileName('///', '.md'), 'deck.md');
  assert.equal(deckFileName('  .hidden.  ', '.md'), 'hidden.md');
});

test('backupFileName uses the local date', () => {
  assert.equal(
    backupFileName(new Date(2026, 0, 5, 23, 30)),
    'pocket-flashcards-backup-2026-01-05.json',
  );
});
