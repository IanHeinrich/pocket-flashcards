// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hash } from '../../src/core/hash.js';

describe('hash', () => {
  it('returns the same value for the same text', () => {
    assert.equal(hash('Paris'), hash('Paris'));
  });

  it('returns different values for different text', () => {
    assert.notEqual(hash('Paris'), hash('paris'));
    assert.notEqual(hash('Na'), hash('K'));
  });

  it('returns a base-36 string that fits in 53 bits', () => {
    for (const text of ['', 'a', 'Sodium is Na', 'Ünïcödé ✓']) {
      const value = hash(text);
      assert.match(value, /^[0-9a-z]+$/);
      assert.ok(parseInt(value, 36) <= Number.MAX_SAFE_INTEGER);
    }
  });

  it('matches the published cyrb53 values, so stored ids keep matching', () => {
    assert.equal(parseInt(hash('a'), 36), 7929297801672961);
    assert.equal(parseInt(hash('b'), 36), 8684336938537663);
    assert.equal(parseInt(hash(''), 36), 3338908027751811);
    assert.equal(hash('Paris'), '211wi9v7ewh');
  });
});
