// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardStatus, describeNextDue, queueCounts } from '../../src/ui/card-status.js';
import { DAY, FIXED_NOW, HOUR, makeState } from '../helpers.js';

const cutoff = FIXED_NOW + 12 * HOUR;

test('a card without state, or never reviewed, is new', () => {
  assert.deepEqual(cardStatus(undefined, FIXED_NOW, cutoff), { kind: 'new', label: 'New' });
  assert.equal(cardStatus(makeState({ lastReviewed: null }), FIXED_NOW, cutoff).kind, 'new');
});

test('suspended wins over new and due', () => {
  const state = makeState({ suspended: true, lastReviewed: null });
  assert.deepEqual(cardStatus(state, FIXED_NOW, cutoff), {
    kind: 'suspended',
    label: 'Suspended',
  });
});

test('a reviewed card due by the cutoff is due', () => {
  const state = makeState({ lastReviewed: FIXED_NOW - DAY, due: FIXED_NOW + 6 * HOUR });
  assert.deepEqual(cardStatus(state, FIXED_NOW, cutoff), { kind: 'due', label: 'Due' });
});

test('a card due after the cutoff says when', () => {
  const state = makeState({ lastReviewed: FIXED_NOW, due: FIXED_NOW + 3 * DAY });
  assert.deepEqual(cardStatus(state, FIXED_NOW, cutoff), {
    kind: 'scheduled',
    label: 'Due in 3d',
  });
});

test('queueCounts splits a review into due and new cards', () => {
  const states = new Map([
    ['a', makeState({ cardId: 'a', lastReviewed: FIXED_NOW - DAY, due: FIXED_NOW })],
    ['b', makeState({ cardId: 'b', lastReviewed: null })],
  ]);
  assert.deepEqual(queueCounts({ queue: ['a', 'b', 'c'], states }), { due: 1, new: 2 });
  assert.deepEqual(queueCounts({ queue: [], states }), { due: 0, new: 0 });
});

test('describeNextDue says how long until the next card is due', () => {
  assert.equal(describeNextDue(FIXED_NOW + 3 * DAY, FIXED_NOW), 'Next card due in 3d');
  assert.equal(describeNextDue(FIXED_NOW + 20 * HOUR, FIXED_NOW), 'Next card due in 20h');
});
