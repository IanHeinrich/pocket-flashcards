// @ts-check
import { AI_PROMPT } from '../ai-prompt.js';
import { h } from '../dom.js';
import { describeImport, plural } from '../format.js';
import { formatRoute } from '../router.js';
import { prefetchMermaid } from '../rich/mermaid.js';
import { PASTED_TEXT } from '../../services/deck-service.js';

/** @typedef {import('../context.js').AppContext} AppContext */
/** @typedef {import('../../core/types.js').ImportPreview} ImportPreview */
/** @typedef {import('../../core/types.js').ImportSource} ImportSource */
/** @typedef {import('../../core/types.js').ParseProblem} ParseProblem */

const FORMAT_GUIDE_URL =
  'https://github.com/IanHeinrich/pocket-flashcards/blob/main/docs/deck-format.md';
const ACCEPT = '.md,.markdown,.txt,image/*';

/**
 * Import decks from files or pasted text, with a preview before anything is saved.
 * @param {HTMLElement} root
 * @param {AppContext} ctx
 * @returns {() => void}
 */
export function render(root, ctx) {
  const previews = h('div', { class: 'stack previews' });
  const message = h('p', { class: 'notice notice-error', attrs: { role: 'alert', hidden: true } });

  /** @type {Map<HTMLElement, { importable: boolean, commit: () => Promise<void> }>} */
  const pending = new Map();
  /** @type {string[]} */
  const committed = [];

  const fileInput = h('input', {
    class: 'visually-hidden',
    attrs: { type: 'file', multiple: true, accept: ACCEPT, tabindex: -1, 'aria-hidden': 'true' },
    on: {
      change: () => {
        const files = [...(fileInput.files ?? [])];
        fileInput.value = '';
        void previewFiles(files);
      },
    },
  });

  const dropzone = h(
    'div',
    { class: 'dropzone' },
    h('h2', null, 'Deck files'),
    h('p', { class: 'muted small' }, 'Choose a deck’s .md file together with the images it uses.'),
    h(
      'button',
      {
        class: 'btn btn-primary',
        attrs: { type: 'button' },
        on: { click: () => fileInput.click() },
      },
      'Choose files',
    ),
    h('p', { class: 'dropzone-hint' }, 'or drop them here'),
    fileInput,
  );

  const textarea = h('textarea', {
    class: 'textarea',
    attrs: {
      id: 'paste-deck',
      'aria-describedby': 'paste-help',
      rows: 8,
      spellcheck: 'false',
      placeholder:
        '---\ndeck: Geography / World capitals\n---\n\n## What is the capital of Canada?\n\n**Ottawa**',
    },
  });

  const promptDetails = h(
    'details',
    null,
    h('summary', null, 'Show the prompt'),
    h('pre', { class: 'prompt-text' }, AI_PROMPT),
  );

  root.append(
    h(
      'section',
      { class: 'view' },
      h(
        'header',
        { class: 'view-header' },
        h('h1', null, 'Import'),
        h(
          'p',
          { class: 'lede' },
          'Add or update decks from Markdown files or pasted text. You see what will change before anything is saved.',
        ),
      ),
      message,
      previews,
      dropzone,
      h(
        'div',
        { class: 'panel stack' },
        h(
          'div',
          { class: 'field' },
          h('label', { class: 'field-label', attrs: { for: 'paste-deck' } }, 'Paste deck text'),
          h(
            'p',
            { class: 'field-help', attrs: { id: 'paste-help' } },
            'Such as a deck an AI chat wrote for you.',
          ),
        ),
        textarea,
        h(
          'div',
          { class: 'row row-end' },
          h(
            'button',
            {
              class: 'btn btn-primary',
              attrs: { type: 'button' },
              on: { click: () => void previewPasted() },
            },
            'Preview',
          ),
        ),
      ),
      h(
        'div',
        { class: 'panel stack' },
        h('h2', null, 'Make a deck with AI'),
        h(
          'p',
          { class: 'muted' },
          'Copy this prompt into any AI chat, fill in the topic, then paste the reply above.',
        ),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            { class: 'btn', attrs: { type: 'button' }, on: { click: () => void copyPrompt() } },
            'Copy AI prompt',
          ),
          h(
            'a',
            {
              class: 'btn btn-ghost',
              attrs: { href: FORMAT_GUIDE_URL, target: '_blank', rel: 'noopener noreferrer' },
            },
            'Deck format guide',
          ),
        ),
        promptDetails,
      ),
    ),
  );

  /** @param {DragEvent} event */
  const onDragOver = (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    dropzone.classList.add('is-over');
  };
  const onDragLeave = () => dropzone.classList.remove('is-over');
  /** @param {DragEvent} event */
  const onDrop = (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-over');
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) void previewFiles(files);
  };
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', onDrop);
  dropzone.addEventListener('dragleave', onDragLeave);

  /** @param {string} [text] */
  function showMessage(text) {
    message.textContent = text ?? '';
    message.hidden = !text;
  }

  /** @param {File[]} files */
  async function previewFiles(files) {
    /** @type {ImportSource[]} */
    const sources = [];
    /** @type {string[]} */
    const skipped = [];
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        sources.push({ kind: 'image', name: file.name, type: file.type, data: file });
      } else if (/\.(md|markdown|txt)$/i.test(file.name) || file.type.startsWith('text/')) {
        sources.push({ kind: 'deck', name: file.name, text: await file.text() });
      } else {
        skipped.push(file.name);
      }
    }
    if (!sources.some((source) => source.kind === 'deck')) {
      showMessage(
        'Choose at least one deck file (.md, .markdown or .txt). Images are imported together with the deck that uses them.',
      );
      return;
    }
    await runPreview(sources);
    if (skipped.length > 0) {
      ctx.toast(`Skipped ${skipped.join(', ')}: not a deck file or an image.`);
    }
  }

  async function previewPasted() {
    const text = textarea.value;
    if (text.trim() === '') {
      showMessage('Paste a deck into the box first.');
      textarea.focus();
      return;
    }
    await runPreview([{ kind: 'deck', name: PASTED_TEXT, text }]);
  }

  /** @param {ImportSource[]} sources */
  async function runPreview(sources) {
    showMessage();
    let results;
    try {
      results = await ctx.decks.previewImport(sources);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    pending.clear();
    previews.replaceChildren();
    for (const preview of results) {
      const { card, importable, commit } = previewCard(preview);
      pending.set(card, { importable, commit });
      previews.append(card);
    }
    drawImportAll();
    const heading = previews.querySelector('h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      previews.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /** @type {HTMLElement | null} */
  let importAll = null;
  function drawImportAll() {
    importAll?.remove();
    importAll = null;
    const ready = [...pending.values()].filter((item) => item.importable);
    if (ready.length < 2) return;
    importAll = h(
      'div',
      { class: 'row row-end' },
      h(
        'button',
        {
          class: 'btn btn-primary',
          attrs: { type: 'button' },
          on: {
            click: async () => {
              for (const item of ready) await item.commit();
            },
          },
        },
        `Import all (${ready.length})`,
      ),
    );
    previews.prepend(importAll);
  }

  /**
   * @param {ImportPreview} preview
   * @returns {{ card: HTMLElement, importable: boolean, commit: () => Promise<void> }}
   */
  function previewCard(preview) {
    const headingId = `preview-${Math.random().toString(36).slice(2)}`;
    const { diff } = preview;
    const removable = !preview.isNew && diff.removed.length > 0;
    const removeBox = h('input', { attrs: { type: 'checkbox' } });
    const importable = preview.cards.length > 0;

    const importButton = h(
      'button',
      {
        class: 'btn btn-primary',
        attrs: { type: 'button', disabled: !importable },
        on: { click: () => void commit() },
      },
      preview.isNew ? 'Import' : 'Update deck',
    );

    const card = h(
      'article',
      {
        class: 'panel preview-card',
        attrs: { 'aria-labelledby': headingId },
      },
      h(
        'div',
        { class: 'preview-head' },
        h(
          'div',
          { class: 'row' },
          h(
            'span',
            { class: preview.isNew ? 'badge badge-new' : 'badge badge-due' },
            preview.isNew ? 'New deck' : 'Update',
          ),
          h('span', { class: 'muted small' }, `From ${preview.sourceName}`),
        ),
        h('h2', { attrs: { id: headingId } }, preview.meta.name || 'Deck without a name'),
      ),
      h(
        'dl',
        { class: 'counts' },
        count('New', diff.added.length),
        count('Updated', diff.updated.length),
        count('No longer in the file', diff.removed.length),
        count('Unchanged', diff.unchanged.length),
      ),
      problems(
        preview.errors,
        `${plural(preview.errors.length, 'problem')}: some content was skipped`,
        'problems-error',
      ),
      problems(preview.warnings, plural(preview.warnings.length, 'warning'), 'problems-warning'),
      preview.missingImages.length > 0 &&
        h(
          'ul',
          { class: 'problems problems-warning' },
          h(
            'li',
            { class: 'problems-title' },
            `Images not found (${preview.missingImages.length})`,
          ),
          preview.missingImages.map((path) => h('li', null, path)),
          h(
            'li',
            null,
            'Choose the images together with the deck file to include them. Cards show a notice where an image is missing.',
          ),
        ),
      preview.hasDiagrams &&
        h(
          'p',
          { class: 'notice' },
          'This deck has diagrams. They are drawn on this device, and the drawing code is saved for offline use when you import.',
        ),
      removable &&
        h(
          'label',
          { class: 'check' },
          removeBox,
          h(
            'span',
            null,
            `Also remove ${plural(diff.removed.length, 'card')} that ${diff.removed.length === 1 ? 'is' : 'are'} no longer in the file (their progress is lost)`,
          ),
        ),
      h(
        'div',
        { class: 'row row-end' },
        h(
          'button',
          { class: 'btn', attrs: { type: 'button' }, on: { click: () => discard() } },
          'Cancel',
        ),
        importButton,
      ),
    );

    function discard() {
      pending.delete(card);
      card.remove();
      drawImportAll();
      if (pending.size === 0) finishIfDone();
    }

    async function commit() {
      if (importButton.disabled) return;
      importButton.disabled = true;
      try {
        const result = await ctx.decks.commitImport(preview, {
          removeMissing: removable && removeBox.checked,
        });
        ctx.afterImport();
        if (preview.hasDiagrams) void prefetchMermaid();
        ctx.toast(describeImport(preview.meta.name, result));
        committed.push(preview.deckId);
        discard();
      } catch (error) {
        importButton.disabled = false;
        ctx.toast(error instanceof Error ? error.message : String(error));
      }
    }

    return { card, importable, commit };
  }

  function finishIfDone() {
    if (committed.length === 1) ctx.navigate(formatRoute({ name: 'deck', deckId: committed[0] }));
    else if (committed.length > 1) ctx.navigate('#/');
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      ctx.toast('Prompt copied. Paste it into an AI chat and fill in the topic.');
    } catch {
      promptDetails.open = true;
      ctx.toast('The prompt could not be copied. Select it below and copy it.');
    }
  }

  return () => {
    window.removeEventListener('dragover', onDragOver);
    window.removeEventListener('drop', onDrop);
  };
}

/**
 * @param {string} label
 * @param {number} value
 * @returns {HTMLElement}
 */
function count(label, value) {
  return h('div', { class: 'stat' }, h('dt', null, label), h('dd', null, String(value)));
}

/**
 * @param {ParseProblem[]} list
 * @param {string} title
 * @param {string} className
 * @returns {HTMLElement | false}
 */
function problems(list, title, className) {
  if (list.length === 0) return false;
  return h(
    'ul',
    { class: `problems ${className}` },
    h('li', { class: 'problems-title' }, title),
    list.map((problem) =>
      h(
        'li',
        null,
        problem.line > 0 ? `Line ${problem.line}: ${problem.message}` : problem.message,
      ),
    ),
  );
}
