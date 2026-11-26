// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  closesFence,
  markFencedLines,
  openingFence,
  renderMarkdown,
} from '../../src/core/markdown.js';

/**
 * @param {string} text
 * @param {{ allowRemoteImages?: boolean }} [options]
 * @returns {string}
 */
function html(text, options) {
  return renderMarkdown(text, options).html;
}

/**
 * Fails if the HTML contains a tag other than the renderer's own output tags,
 * or any attribute other than the ones the renderer writes.
 * @param {string} output
 */
function assertOnlySafeMarkup(output) {
  const tags = output.match(/<\/?[a-z][^>]*>/gi) ?? [];
  for (const tag of tags) {
    assert.match(
      tag,
      /^<\/?(p|br|strong|em|code|pre|h[3-6]|blockquote|ul|ol|li|hr|a|img|span|div)(\s+(href|rel|target|src|alt|class|data-asset|data-mermaid|start)="[^"<>]*")*>$/,
      `unexpected markup: ${tag}`,
    );
    const attributeNames = tag.replace(/="[^"]*"/g, '');
    assert.doesNotMatch(attributeNames, /\son[a-z]+/i, `event handler attribute: ${tag}`);
  }
  assert.doesNotMatch(output, /(href|src)="\s*(javascript|vbscript|data:text)/i);
}

describe('fence helpers', () => {
  it('reads an opening fence with its info word', () => {
    assert.deepEqual(openingFence('```mermaid'), { char: '`', length: 3, info: 'mermaid' });
    assert.deepEqual(openingFence('~~~~ js extra'), { char: '~', length: 4, info: 'js' });
    assert.equal(openingFence('``not a fence``'), null);
    assert.equal(openingFence('text'), null);
  });

  it('closes only with the same character and at least the same length', () => {
    const fence = { char: '`', length: 4, info: '' };
    assert.equal(closesFence('````', fence), true);
    assert.equal(closesFence('`````', fence), true);
    assert.equal(closesFence('```', fence), false);
    assert.equal(closesFence('~~~~', fence), false);
    assert.equal(closesFence('```` js', fence), false);
  });

  it('marks fence lines and the lines inside them', () => {
    assert.deepEqual(markFencedLines(['a', '~~~', '```', '~~~', 'b']), [
      false,
      true,
      true,
      true,
      false,
    ]);
  });
});

describe('renderMarkdown: blocks', () => {
  it('wraps text in paragraphs, with single newlines as line breaks', () => {
    assert.equal(
      html('Sodium\nis Na\n\nPotassium is K'),
      '<p>Sodium<br>is Na</p>\n<p>Potassium is K</p>',
    );
  });

  it('renders headings of levels 3 to 6', () => {
    assert.equal(html('### Acids'), '<h3>Acids</h3>');
    assert.equal(html('###### Bases'), '<h6>Bases</h6>');
  });

  it('leaves first- and second-level headings as text', () => {
    assert.equal(html('# Capitals'), '<p># Capitals</p>');
  });

  it('renders block quotes', () => {
    assert.equal(
      html('> Paris\n> is the capital'),
      '<blockquote><p>Paris<br>is the capital</p></blockquote>',
    );
  });

  it('renders --- and *** as rules', () => {
    assert.equal(html('Above\n\n---\n\nBelow'), '<p>Above</p>\n<hr>\n<p>Below</p>');
    assert.equal(html('***'), '<hr>');
  });

  it('renders bulleted lists with any bullet marker', () => {
    assert.equal(
      html('- Paris\n* Berlin\n+ Rome'),
      '<ul><li>Paris</li><li>Berlin</li><li>Rome</li></ul>',
    );
  });

  it('renders numbered lists, keeping a start number other than 1', () => {
    assert.equal(html('1. Lithium\n2. Sodium'), '<ol><li>Lithium</li><li>Sodium</li></ol>');
    assert.equal(
      html('3. Potassium\n4. Rubidium'),
      '<ol start="3"><li>Potassium</li><li>Rubidium</li></ol>',
    );
  });

  it('renders one nested level under a list item', () => {
    assert.equal(
      html('- Metals\n  - Sodium\n  - Iron\n- Gases'),
      '<ul><li>Metals<ul><li>Sodium</li><li>Iron</li></ul></li><li>Gases</li></ul>',
    );
    assert.equal(
      html('1. Alkali\n   - Sodium\n2. Noble'),
      '<ol><li>Alkali<ul><li>Sodium</li></ul></li><li>Noble</li></ol>',
    );
  });

  it('keeps a list going across blank lines', () => {
    assert.equal(html('- Paris\n\n- Berlin'), '<ul><li>Paris</li><li>Berlin</li></ul>');
  });

  it('lets a list start right after a paragraph line', () => {
    assert.equal(html('Capitals:\n- Paris'), '<p>Capitals:</p>\n<ul><li>Paris</li></ul>');
  });

  it('renders fenced code with its language, without formatting inside', () => {
    assert.equal(
      html('```js\nconst a = **b** && c < d;\n```'),
      '<pre><code class="language-js">const a = **b** &amp;&amp; c &lt; d;</code></pre>',
    );
    assert.equal(html('~~~\n## not a heading\n~~~'), '<pre><code>## not a heading</code></pre>');
  });

  it('drops a language name that is not a plain word', () => {
    assert.equal(html('```"><script>\nx\n```'), '<pre><code>x</code></pre>');
  });

  it('runs an unclosed fence to the end of the text', () => {
    assert.equal(html('```\nH2O\n\nNaCl'), '<pre><code>H2O\n\nNaCl</code></pre>');
  });
});

describe('renderMarkdown: diagrams', () => {
  it('collects mermaid sources and leaves an escaped placeholder for each', () => {
    const result = renderMarkdown('```mermaid\ngraph LR\n  H --> O\n```\n\n```mermaid\npie\n```');
    assert.deepEqual(result.mermaid, ['graph LR\n  H --> O', 'pie']);
    assert.equal(
      result.html,
      '<div class="mermaid-block" data-mermaid="0"><pre>graph LR\n  H --&gt; O</pre></div>\n' +
        '<div class="mermaid-block" data-mermaid="1"><pre>pie</pre></div>',
    );
  });

  it('gives back the source exactly, entities and all', () => {
    const source = 'graph LR\n  A["&amp; <b>"] --> B';
    assert.deepEqual(renderMarkdown('```mermaid\n' + source + '\n```').mermaid, [source]);
  });

  it('returns no diagrams for text without any', () => {
    assert.deepEqual(renderMarkdown('Just text').mermaid, []);
  });
});

describe('renderMarkdown: inline', () => {
  it('renders bold and both kinds of italic', () => {
    assert.equal(
      html('**Na**, from _natrium_ or *natrium*'),
      '<p><strong>Na</strong>, from <em>natrium</em> or <em>natrium</em></p>',
    );
  });

  it('does not italicise underscores inside words', () => {
    assert.equal(html('use snake_case_names here'), '<p>use snake_case_names here</p>');
  });

  it('does not format inside inline code', () => {
    assert.equal(html('`**a** <b>`'), '<p><code>**a** &lt;b&gt;</code></p>');
  });

  it('renders allowed links with safe attributes', () => {
    const link = (/** @type {string} */ href) =>
      `<a href="${href}" rel="noopener noreferrer" target="_blank">text</a>`;
    assert.equal(html('[text](https://example.com)'), `<p>${link('https://example.com')}</p>`);
    assert.equal(html('[text](http://example.com)'), `<p>${link('http://example.com')}</p>`);
    assert.equal(html('[text](mailto:a@example.com)'), `<p>${link('mailto:a@example.com')}</p>`);
  });

  it('escapes & in link URLs and keeps underscores in them as they are', () => {
    assert.equal(
      html('[q](https://example.com/a_b_c?x=1&y=2)'),
      '<p><a href="https://example.com/a_b_c?x=1&amp;y=2" rel="noopener noreferrer" target="_blank">q</a></p>',
    );
  });

  it('formats link text', () => {
    assert.match(html('[**Paris**](https://example.com)'), /><strong>Paris<\/strong><\/a>/);
  });

  it('shows only the text of a link to a relative or unknown target', () => {
    assert.equal(html('[notes](notes.html)'), '<p>notes</p>');
    assert.equal(html('[ftp](ftp://example.com)'), '<p>ftp</p>');
  });

  it('renders asset images without a src, for the UI to fill', () => {
    assert.equal(
      html('![Periodic table](asset:a_1x2y)'),
      '<p><img data-asset="a_1x2y" alt="Periodic table"></p>',
    );
  });

  it('keeps data: images of the allowed image types', () => {
    for (const type of ['png', 'jpeg', 'gif', 'webp', 'svg+xml']) {
      const src = `data:image/${type};base64,iVBORw0KGgo=`;
      assert.equal(html(`![dot](${src})`), `<p><img src="${src}" alt="dot"></p>`);
    }
  });

  it('blocks https images unless remote images are allowed', () => {
    assert.equal(
      html('![Map](https://example.com/map.png)'),
      '<p><span class="img-blocked">Remote image blocked: Map</span></p>',
    );
    assert.equal(
      html('![Map](https://example.com/map.png)', { allowRemoteImages: true }),
      '<p><img src="https://example.com/map.png" alt="Map"></p>',
    );
  });

  it('shows relative, http and other images as missing', () => {
    for (const src of ['images/a.png', 'http://example.com/a.png', 'file:///c/a.png']) {
      assert.equal(
        html(`![A](${src})`),
        '<p><span class="img-missing">Missing image: A</span></p>',
      );
    }
  });

  it('reads image paths in angle brackets and ignores titles', () => {
    assert.equal(
      html('![A](<images/my pic.png> "Title")'),
      '<p><span class="img-missing">Missing image: A</span></p>',
    );
  });

  it('puts an image inside a link', () => {
    assert.equal(
      html('[![pic](asset:a_1)](https://example.com)'),
      '<p><a href="https://example.com" rel="noopener noreferrer" target="_blank"><img data-asset="a_1" alt="pic"></a></p>',
    );
  });
});

describe('renderMarkdown: security', () => {
  it('shows script tags as text', () => {
    const output = html('<script>alert(1)</script>');
    assert.equal(output, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    assertOnlySafeMarkup(output);
  });

  it('shows HTML with event handlers as text', () => {
    const output = html('<img src=x onerror=alert(1)> <div onclick="steal()">hi</div>');
    assert.doesNotMatch(output, /<img|<div/);
    assertOnlySafeMarkup(output);
  });

  it('escapes all five special characters', () => {
    assert.equal(html(`& < > " '`), '<p>&amp; &lt; &gt; &quot; &#39;</p>');
  });

  it('does not let quotes in alt text break out of the attribute', () => {
    for (const alt of ['x" onerror="alert(1)', "x' onerror='alert(1)"]) {
      for (const src of ['asset:a_1', 'https://example.com/a.png']) {
        const output = html(`![${alt}](${src})`, { allowRemoteImages: true });
        assertOnlySafeMarkup(output);
      }
    }
  });

  it('does not let quotes in URLs break out of the attribute', () => {
    for (const url of [
      'https://example.com/"onmouseover="alert(1)',
      'https://example.com/"><script>alert(1)</script>',
      "https://example.com/'onmouseover='x",
    ]) {
      assertOnlySafeMarkup(html(`[a](${url})`));
      assertOnlySafeMarkup(html(`![a](${url})`, { allowRemoteImages: true }));
    }
  });

  it('refuses javascript:, vbscript: and data:text/html links in any case', () => {
    for (const url of [
      'javascript:alert(1)',
      'javascript:alert',
      'JaVaScRiPt:alert',
      'vbscript:msgbox',
      'data:text/html;base64,PHNjcmlwdD4=',
      '&#106;avascript:alert',
      '&#x6A;avascript:alert',
      'java&#09;script:alert',
      '%6Aavascript:alert',
    ]) {
      const output = html(`[click](${url})`);
      assert.doesNotMatch(output, /<a /, url);
      assertOnlySafeMarkup(output);
    }
  });

  it('refuses javascript:, vbscript: and data:text/html images', () => {
    for (const url of [
      'javascript:alert(1)',
      'vbscript:msgbox',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/svg+xml,<svg onload=alert(1)>',
      'data:image/png;base64,abc"onerror="x',
      '&#106;avascript:alert',
    ]) {
      const output = html(`![pic](${url})`, { allowRemoteImages: true });
      assert.doesNotMatch(output, /<img/, url);
      assertOnlySafeMarkup(output);
    }
  });

  it('keeps entities in the text as text', () => {
    assert.equal(html('&#106;&lt;'), '<p>&amp;#106;&amp;lt;</p>');
  });

  it('does not turn nested brackets into a link', () => {
    const output = html('[a [b] c](https://example.com)');
    assert.doesNotMatch(output, /<a /);
    assertOnlySafeMarkup(output);
  });

  it('does not let brackets in alt text smuggle in a link', () => {
    const output = html('![x](asset:a_1)](javascript:alert)');
    assert.doesNotMatch(output, /javascript:alert"/);
    assertOnlySafeMarkup(output);
  });

  it('only allows plain ids for asset images', () => {
    const output = html('![x](asset:a_1"onerror="alert)');
    assert.doesNotMatch(output, /data-asset/);
    assertOnlySafeMarkup(output);
  });

  it('does not let an image inside a link URL break out of the href', () => {
    const output = html(
      '[l](https://a![ onmouseover=alert(1) style=position:fixed;inset:0 ](data:image/png;base64,AAAA/x=))',
    );
    assert.doesNotMatch(output, /<a /);
    assert.doesNotMatch(output, /href="[^"]*<img/);
    assertOnlySafeMarkup(output);
    assert.doesNotMatch(output.replace(/alt="[^"]*"/g, ''), /onmouseover=/);
  });

  it('does not let a code span inside a link URL put markup in the href', () => {
    const output = html('[l](https://a.com/`x`)');
    assert.doesNotMatch(output, /<a /);
    assert.doesNotMatch(output, /href=/);
    assertOnlySafeMarkup(output);
  });

  it('does not let a code span or image inside an image src put markup in the src', () => {
    for (const text of [
      '![a](https://a.com/`x`)',
      '![a](<https://a.com/`x`>)',
      '![a](https://a.com/![b](asset:a_1))',
      '![a](asset:![b](asset:a_1))',
    ]) {
      const output = html(text, { allowRemoteImages: true });
      assert.doesNotMatch(output, /(src|data-asset)="[^"]*[<>]/, text);
      assert.doesNotMatch(output, /<img src=/, text);
      assertOnlySafeMarkup(output);
    }
  });

  it('does not let a link or code span inside image alt text put markup in the alt', () => {
    for (const text of [
      '![see `x` and [a](https://a.com)](asset:a_1)',
      '![see [a](https://a.com)](https://a.com/a.png)',
      '![`x`](asset:a_1)',
    ]) {
      const output = html(text, { allowRemoteImages: true });
      assert.doesNotMatch(output, /(alt|src|href)="[^"]*[<>]/, text);
      assertOnlySafeMarkup(output);
    }
    assert.equal(html('![![b](asset:a_2)](asset:a_1)'), '<p>!<img data-asset="a_2" alt="b"></p>');
  });

  it('keeps diagram sources escaped in the HTML', () => {
    const result = renderMarkdown('```mermaid\ngraph LR\n  A["<img src=x onerror=alert(1)>"]\n```');
    assertOnlySafeMarkup(result.html);
    assert.match(result.mermaid[0], /<img src=x onerror=alert\(1\)>/);
  });

  it('escapes HTML inside every block type', () => {
    const output = html(
      '### <b>h</b>\n\n> <i>q</i>\n\n- <u>l</u>\n  - <s>n</s>\n\n1. <em>o</em>\n\n```\n<pre>\n```',
    );
    assertOnlySafeMarkup(output);
    assert.doesNotMatch(output, /<(b|i|u|s)>/);
  });
});
