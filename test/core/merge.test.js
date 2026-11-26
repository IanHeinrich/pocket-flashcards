// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diffCards } from '../../src/core/merge.js';
import { makeCard } from '../helpers.js';

const paris = makeCard({ id: 'c_paris', front: 'Capital of France?', back: 'Paris', position: 0 });
const berlin = makeCard({
  id: 'c_berlin',
  front: 'Capital of Germany?',
  back: 'Berlin',
  position: 1,
});
const madrid = makeCard({
  id: 'c_madrid',
  front: 'Capital of Spain?',
  back: 'Madrid',
  position: 2,
});

describe('diffCards', () => {
  it('reports every card as added when nothing is stored', () => {
    assert.deepEqual(diffCards([], [paris, berlin]), {
      added: [paris, berlin],
      updated: [],
      removed: [],
      unchanged: [],
    });
  });

  it('reports cards with the same id, front, back and position as unchanged', () => {
    const diff = diffCards([paris, berlin], [{ ...paris }, { ...berlin }]);
    assert.deepEqual(diff.unchanged, [paris, berlin]);
    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.updated, []);
    assert.deepEqual(diff.removed, []);
  });

  it('reports a changed back as updated, with the incoming version', () => {
    const fixed = { ...paris, back: '**Paris**, on the Seine' };
    const diff = diffCards([paris], [fixed]);
    assert.deepEqual(diff.updated, [fixed]);
    assert.deepEqual(diff.unchanged, []);
  });

  it('reports a front that changed only in whitespace as updated', () => {
    const before = makeCard({ id: 'c_code', front: '```\na  b\n```', back: 'x', position: 0 });
    const after = { ...before, front: '```\na b\n```' };
    const diff = diffCards([before], [after]);
    assert.deepEqual(diff.updated, [after]);
    assert.deepEqual(diff.unchanged, []);
  });

  it('reports a front whose image path became an asset reference as updated', () => {
    const before = makeCard({ id: 'c_img', front: 'Map ![x](a.png)', back: 'x', position: 0 });
    const after = { ...before, front: 'Map ![x](asset:a_1x2y)' };
    const diff = diffCards([before], [after]);
    assert.deepEqual(diff.updated, [after]);
    assert.deepEqual(diff.unchanged, []);
  });

  it('reports a changed position as updated', () => {
    const moved = { ...paris, position: 5 };
    assert.deepEqual(diffCards([paris], [moved]).updated, [moved]);
  });

  it('reports stored cards missing from the import as removed', () => {
    const diff = diffCards([paris, berlin, madrid], [berlin]);
    assert.deepEqual(diff.removed, [paris, madrid]);
    assert.deepEqual(diff.unchanged, [berlin]);
  });

  it('sorts a mixed import into all four lists', () => {
    const rome = makeCard({ id: 'c_rome', front: 'Capital of Italy?', back: 'Rome', position: 2 });
    const berlinFixed = { ...berlin, back: 'Berlin, since 1990' };
    const diff = diffCards([paris, berlin, madrid], [paris, berlinFixed, rome]);
    assert.deepEqual(diff, {
      added: [rome],
      updated: [berlinFixed],
      removed: [madrid],
      unchanged: [paris],
    });
  });

  it('does not change its inputs', () => {
    const existing = [paris, berlin];
    const incoming = [{ ...paris, back: 'Paris!' }];
    const before = JSON.stringify([existing, incoming]);
    diffCards(existing, incoming);
    assert.equal(JSON.stringify([existing, incoming]), before);
  });
});
