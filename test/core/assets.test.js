// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findImageRefs,
  matchAssetFile,
  normalizeAssetPath,
  restoreImageRefs,
  rewriteImageRefs,
} from '../../src/core/assets.js';

describe('normalizeAssetPath', () => {
  it('turns backslashes into forward slashes', () => {
    assert.equal(normalizeAssetPath('images\\elements\\na.png'), 'images/elements/na.png');
  });

  it('trims and strips a leading ./ or /', () => {
    assert.equal(normalizeAssetPath('  ./images/na.png '), 'images/na.png');
    assert.equal(normalizeAssetPath('/images/na.png'), 'images/na.png');
    assert.equal(normalizeAssetPath('.//./images/na.png'), 'images/na.png');
  });

  it('collapses doubled slashes', () => {
    assert.equal(normalizeAssetPath('images//elements///na.png'), 'images/elements/na.png');
  });

  it('decodes %20-style escapes', () => {
    assert.equal(normalizeAssetPath('images/periodic%20table.png'), 'images/periodic table.png');
    assert.equal(normalizeAssetPath('caf%C3%A9.png'), 'café.png');
  });

  it('leaves malformed escapes as written', () => {
    assert.equal(normalizeAssetPath('100%.png'), '100%.png');
    assert.equal(normalizeAssetPath('bad%E0%A4.png'), 'bad%E0%A4.png');
    assert.equal(normalizeAssetPath('a%20b%zz.png'), 'a b%zz.png');
  });
});

describe('findImageRefs', () => {
  it('lists relative image paths in order, once each', () => {
    const markdown = '![Na](images/na.png) and ![K](k.png)\n\n![Na again](images/na.png)';
    assert.deepEqual(findImageRefs(markdown), ['images/na.png', 'k.png']);
  });

  it('skips remote, data and asset images', () => {
    const markdown = [
      '![a](https://example.com/a.png)',
      '![b](http://example.com/b.png)',
      '![c](data:image/png;base64,AAAA)',
      '![d](asset:a_123)',
      '![e](//example.com/e.png)',
      '![f](local.png)',
    ].join('\n');
    assert.deepEqual(findImageRefs(markdown), ['local.png']);
  });

  it('skips images inside fenced code and inline code', () => {
    const markdown = '```\n![a](a.png)\n```\n`![b](b.png)` ![c](c.png)\n~~~~\n![d](d.png)\n~~~~';
    assert.deepEqual(findImageRefs(markdown), ['c.png']);
  });

  it('reads a title after the path and paths in angle brackets', () => {
    const markdown = '![a](a.png "Sodium") ![b](<images/periodic table.png>)';
    assert.deepEqual(findImageRefs(markdown), ['a.png', 'images/periodic table.png']);
  });

  it('ignores links that are not images', () => {
    assert.deepEqual(findImageRefs('[a](a.png)'), []);
  });

  it('handles CRLF line endings', () => {
    assert.deepEqual(findImageRefs('```\r\n![a](a.png)\r\n```\r\n![b](b.png)\r\n'), ['b.png']);
  });
});

describe('matchAssetFile', () => {
  const files = ['images/na.png', 'k.PNG', 'diagrams/water.svg'];

  it('matches the same normalised path first', () => {
    assert.equal(matchAssetFile('./images/na.png', files), 'images/na.png');
    assert.equal(matchAssetFile('images\\na.png', files), 'images/na.png');
  });

  it('prefers an exact path over a file with the same name', () => {
    assert.equal(matchAssetFile('b/na.png', ['a/na.png', 'b/na.png']), 'b/na.png');
  });

  it('falls back to the file name, ignoring case', () => {
    assert.equal(matchAssetFile('elements/K.png', files), 'k.PNG');
    assert.equal(matchAssetFile('water.svg', files), 'diagrams/water.svg');
  });

  it('matches escaped and unescaped spellings', () => {
    assert.equal(
      matchAssetFile('periodic%20table.png', ['periodic table.png']),
      'periodic table.png',
    );
  });

  it('returns null when nothing matches', () => {
    assert.equal(matchAssetFile('images/fe.png', files), null);
    assert.equal(matchAssetFile('na.png', []), null);
  });
});

describe('rewriteImageRefs', () => {
  it('replaces mapped refs with asset ids and keeps the alt text', () => {
    const markdown = 'Sodium: ![Na metal](images/na.png "title")';
    assert.equal(
      rewriteImageRefs(markdown, new Map([['images/na.png', 'a_1']])),
      'Sodium: ![Na metal](asset:a_1)',
    );
  });

  it('accepts a plain object as the map', () => {
    assert.equal(rewriteImageRefs('![x](k.png)', { 'k.png': 'a_2' }), '![x](asset:a_2)');
  });

  it('leaves unmapped refs, code and other text alone', () => {
    const markdown = '![a](a.png) `![b](b.png)`\n```\n![b](b.png)\n```\n![b](b.png)';
    assert.equal(
      rewriteImageRefs(markdown, new Map([['b.png', 'a_9']])),
      '![a](a.png) `![b](b.png)`\n```\n![b](b.png)\n```\n![b](asset:a_9)',
    );
  });

  it('ignores inherited object keys', () => {
    assert.equal(rewriteImageRefs('![x](constructor)', {}), '![x](constructor)');
  });

  it('rewrites refs written in angle brackets', () => {
    assert.equal(
      rewriteImageRefs('![t](<periodic table.png>)', { 'periodic table.png': 'a_3' }),
      '![t](asset:a_3)',
    );
  });
});

describe('restoreImageRefs', () => {
  it('turns asset ids back into paths', () => {
    assert.equal(
      restoreImageRefs('![Na](asset:a_1)', new Map([['a_1', 'images/na.png']])),
      '![Na](images/na.png)',
    );
  });

  it('wraps paths with spaces in angle brackets', () => {
    assert.equal(
      restoreImageRefs('![t](asset:a_3)', { a_3: 'periodic table.png' }),
      '![t](<periodic table.png>)',
    );
  });

  it('leaves unknown asset ids and other images alone', () => {
    const markdown = '![a](asset:a_404) ![b](https://example.com/b.png)';
    assert.equal(restoreImageRefs(markdown, { a_1: 'x.png' }), markdown);
  });

  it('undoes rewriteImageRefs', () => {
    const markdown = 'See ![Na](images/na.png) and ![t](<periodic table.png>)';
    const rewritten = rewriteImageRefs(markdown, {
      'images/na.png': 'a_1',
      'periodic table.png': 'a_2',
    });
    const restored = restoreImageRefs(rewritten, {
      a_1: 'images/na.png',
      a_2: 'periodic table.png',
    });
    assert.equal(restored, markdown);
    assert.deepEqual(findImageRefs(restored), findImageRefs(markdown));
  });
});
