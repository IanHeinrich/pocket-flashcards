// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usesWebImage } from '../../../src/ui/rich/mermaid.js';

test('a diagram without images is drawn', () => {
  assert.equal(usesWebImage('flowchart LR\n  A[Start] --> B{Choice}'), false);
});

test('an image shape with a web address is refused', () => {
  assert.equal(usesWebImage('flowchart TD\n  A@{ img: "https://example.com/p.png" }'), true);
  assert.equal(usesWebImage("flowchart TD\n  A@{ img: 'http://example.com/p.png' }"), true);
  assert.equal(usesWebImage('flowchart TD\n  A@{ img: //example.com/p.png }'), true);
  assert.equal(usesWebImage('flowchart TD\n  A@{ shape: image, IMG : https://x.test }'), true);
});

test('an icon shape is refused unless it is a data: URI', () => {
  assert.equal(usesWebImage('flowchart TD\n  A@{ icon: "fa:user" }'), true);
  assert.equal(usesWebImage('flowchart TD\n  A@{ icon: "data:image/svg+xml,%3Csvg%3E" }'), false);
});

test('an image given as a data: URI is drawn', () => {
  assert.equal(
    usesWebImage('flowchart TD\n  A@{ img: "data:image/png;base64,iVBORw0KGgo=", h: 40 }'),
    false,
  );
});

test('every image in the diagram is checked, not only the first', () => {
  const source =
    'flowchart TD\n  A@{ img: "data:image/png;base64,AA==" }\n  B@{ img: "https://x.test/b.png" }';
  assert.equal(usesWebImage(source), true);
});

test('quoted and escaped keys are still found', () => {
  assert.equal(usesWebImage('flowchart TD\n  A@{ "img": "https://x.test/a.png" }'), true);
  assert.equal(usesWebImage('flowchart TD\n  A@{ "im\\x67": "https://x.test/a.png" }'), true);
  assert.equal(usesWebImage('flowchart TD\n  A@{ "\\u0069con": "https://x.test/a.png" }'), true);
});

test('a word that only ends in img is not a key', () => {
  assert.equal(usesWebImage('flowchart TD\n  A[svgimg] --> B'), false);
});
