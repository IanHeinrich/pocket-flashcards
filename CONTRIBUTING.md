# Contributing

Thank you for helping. Pocket Flashcards is small on purpose, so a few short rules keep it that way.

## Report a bug

Open an issue and say:

- what you did,
- what you expected to happen,
- what happened instead,
- your browser and operating system, and whether you installed the app.

If a deck triggers the bug, include the smallest deck that shows it. Never paste a private deck.

## Ask for a feature

Open an issue and describe what you want to do and why. A feature that needs a network request, an
account or a build step will not fit: the app keeps your cards on your device, and the files in the
repository are the files that run.

## Send a pull request

1. For anything bigger than a small fix, open an issue first so we can agree on the approach.
2. Read [docs/engineering-rules.md](docs/engineering-rules.md). It lists the non-negotiables and the
   reason behind each.
3. Run `npm test`, `npm run lint` and `npm run typecheck`. CI runs the same three.
4. Add one file under `changelog.d/` that says what a user sees or can now do. Its README has the
   format. Skip it if a user would not notice the change.
5. Keep the pull request focused on one change.

For a change to the screen, check it at phone width as well.

## Maintainers

- `npm run vendor` copies the pinned Mermaid build from `node_modules/` into `vendor/`. Run it after
  changing the Mermaid version in `package.json`.
- `node scripts/make-icons.mjs` regenerates everything in `icons/`. It needs no dependencies.
- `npm run changelog collect` folds the files in `changelog.d/` into `CHANGELOG.md` when cutting a release.
- Merging to `main` deploys to GitHub Pages. The repository's Pages source must be set to
  **GitHub Actions**.
