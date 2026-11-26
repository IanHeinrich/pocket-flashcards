// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom, shuffle } from '../../src/core/random.js';
import { rng } from '../helpers.js';

describe('seededRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const first = [a(), a(), a()];
    assert.deepEqual([b(), b(), b()], first);
  });

  it('gives a different sequence for a different seed', () => {
    assert.notEqual(seededRandom(1)(), seededRandom(2)());
  });

  it('returns numbers in [0, 1)', () => {
    const random = seededRandom(7);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      assert.ok(value >= 0 && value < 1);
    }
  });
});

describe('shuffle', () => {
  const items = ['Paris', 'Berlin', 'Madrid', 'Rome', 'Lisbon', 'Vienna'];

  it('returns the same items in some order', () => {
    const result = shuffle(items, rng());
    assert.deepEqual([...result].sort(), [...items].sort());
  });

  it('does not change the input array', () => {
    const copy = [...items];
    shuffle(items, rng());
    assert.deepEqual(items, copy);
  });

  it('returns a new array', () => {
    assert.notEqual(shuffle(items, rng()), items);
  });

  it('gives the same order for the same seed', () => {
    assert.deepEqual(shuffle(items, rng(3)), shuffle(items, rng(3)));
  });

  it('actually reorders the items for a typical seed', () => {
    assert.notDeepEqual(shuffle(items, rng(1)), items);
  });

  it('handles empty and single-item lists', () => {
    assert.deepEqual(shuffle([], rng()), []);
    assert.deepEqual(shuffle(['Paris'], rng()), ['Paris']);
  });
});
