# Engineering rules

For contributors, people and tools alike.

Pocket Flashcards is a private, offline flashcard app. It is a static
progressive web app written in plain JavaScript modules, with no build step
and no runtime dependencies. [architecture.md](architecture.md) explains how
it fits together, and [deck-format.md](deck-format.md) is the deck file spec.

## Non-negotiables

Each rule comes with its reason, so a case it doesn't name can be judged
by the reason.

- Nothing leaves the device. The app makes no request to any origin but its
  own: no CDN, no analytics, no fonts, no telemetry. People use it for
  material they won't put on a hosted service, and one stray request breaks
  that promise. Remote images are the single opt-in exception, off by
  default and named as such in Settings.
- No build step and no runtime dependencies. The files in the repo are the
  files that are served, so anyone can audit what runs. Third-party code
  that has to ship (Mermaid) is vendored under `vendor/`, pinned in
  `package.json`, copied by `npm run vendor`, and loaded only when needed.
- Never trust deck text. Decks are pasted from anywhere, including AI
  output. Text reaches the DOM through `textContent` or through
  `core/markdown.js`, which escapes before it formats. `innerHTML` is used
  only for that renderer's output.
- Keep progress through edits. A card's identity is derived from its deck
  and its front, so re-importing an edited deck keeps the review history of
  every card whose front did not change.
- Make every stored shape versioned. The IndexedDB schema and the backup
  file both carry a version number, and a migration or a validator handles
  each older version. People's progress outlives any one release.

## Layers

```
ui/  ──►  services/  ──►  core/
```

- `src/core/` is pure: no DOM, no storage, no clock or randomness except
  through a parameter. Everything a rule decides (parsing, scheduling,
  identity, diffing, queue building) lives here, so it is tested in Node
  without a browser.
- `src/services/` holds the use cases. It talks to storage only through the
  port in `services/storage/storage.js`, so the IndexedDB adapter and the
  in-memory test adapter are interchangeable.
- `src/ui/` renders and handles input. A view asks a service and draws the
  answer; it makes no decision a test would need to pin.
- `src/app.js` is the composition root and the only place that constructs
  storage, services and the router.

Dependencies point inward only. ESLint enforces the import direction and
the purity of `core/`.

## Writing code

- Annotate every exported function with JSDoc types. `// @ts-check` at the
  top of each module and `npm run typecheck` check them without a build.
  Shared shapes are `@typedef`s in `src/core/types.js`.
- One module, one job. A module that needs a second reason to change is two
  modules.
- Prefer returning new objects to mutating arguments. Scheduler and merge
  functions take a state and return the next one.
- Name things in the user's words: deck, card, front, back, review,
  practice, due. Avoid synonyms for the same thing.
- When you write something like an existing helper, move the shared part
  into one function and call it from both. Two copies of a rule start to
  disagree.
- Errors a person reads say what happened and what to do, in plain words.
  Parse errors carry the line number.
- Accessibility is part of done: every control is reachable and usable by
  keyboard, has a visible focus state and an accessible name, and the
  revealed answer is announced.

## Testing

- `node:test` and `node:assert/strict`, no test framework. Tests live in
  `test/` mirroring `src/`: `src/core/scheduler.js` is tested by
  `test/core/scheduler.test.js`.
- Pin a rule once, at the layer that owns it. The parser's rules are pinned
  in the parser's tests; a service test covers what the service adds.
- Pass a fixed clock and a seeded random function rather than stubbing
  globals.
- Services are tested against `MemoryStorage`. The IndexedDB adapter is
  exercised in the browser.
- Every security-relevant path in the Markdown renderer has a test: script
  tags, event-handler attributes, `javascript:` and other disallowed URL
  schemes, and remote images while they are disabled.

## Commands

| Command                     | What it does                                   |
| --------------------------- | ---------------------------------------------- |
| `npm test`                  | Unit tests                                     |
| `npm run lint`              | ESLint and a Prettier check                    |
| `npm run format`            | Prettier, writing files                        |
| `npm run typecheck`         | Type-checks the JSDoc annotations              |
| `npm run serve`             | Serves the app at <http://localhost:8080>      |
| `npm run vendor`            | Copies the pinned Mermaid build into `vendor/` |
| `npm run changelog collect` | Folds `changelog.d/` into `CHANGELOG.md`       |

Run `npm test`, `npm run lint` and `npm run typecheck` before you push. CI
runs the same three.

## Changes and pull requests

- A pull request adds one file under `changelog.d/`, as its README
  describes, unless a user would not notice the change.
- A changelog entry says what a user sees or can now do. How it was built
  goes in the pull request body.
- Merging to `main` deploys the site to GitHub Pages.
