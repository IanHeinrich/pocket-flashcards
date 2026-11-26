// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { systemClock } from '../../src/services/clock.js';
import { FIXED_NOW } from '../helpers.js';

describe('systemClock', () => {
  it('tells the current time', () => {
    const before = Date.now();
    const now = systemClock.now();
    assert.ok(now >= before && now <= Date.now());
  });

  it('gives the first and last millisecond of the local day', () => {
    const start = new Date(systemClock.startOfDay(FIXED_NOW));
    const end = new Date(systemClock.endOfDay(FIXED_NOW));
    const day = new Date(FIXED_NOW);
    for (const edge of [start, end]) {
      assert.equal(edge.getDate(), day.getDate());
      assert.equal(edge.getMonth(), day.getMonth());
    }
    assert.deepEqual(
      [start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()],
      [0, 0, 0, 0],
    );
    assert.equal(systemClock.startOfDay(end.getTime() + 1), end.getTime() + 1);
    assert.ok(start.getTime() <= FIXED_NOW && FIXED_NOW <= end.getTime());
  });
});
