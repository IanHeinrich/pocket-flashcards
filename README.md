# Pocket Flashcards

Private, offline flashcards in plain Markdown. Your cards never leave your device.

[![CI](https://github.com/IanHeinrich/pocket-flashcards/actions/workflows/ci.yml/badge.svg)](https://github.com/IanHeinrich/pocket-flashcards/actions/workflows/ci.yml)

## Why

- **Private.** Your decks and progress stay on your device. The app makes no requests to other
  sites: no accounts, no analytics, no cloud.
- **Offline.** Install it once and it works without a connection.
- **Plain-text decks.** A deck is one Markdown file that you can write by hand, keep in any
  folder, or ask an AI to write for you.

## Features

- Decks written in Markdown, grouped by name (`Science / Chemistry basics`).
- Import from a file or by pasting text. A preview shows what will change before anything is saved.
- Spaced-repetition review: rate each card Again, Hard, Good or Easy, and it comes back when you are due to forget it.
- Practice mode for drilling decks in random order, due or not.
- On a phone, tap a card to see the answer, then swipe right if you got it or left if you missed it.
- Images and Mermaid diagrams on cards.
- Search across all your cards.
- Installs on your phone or computer and works offline.
- Backup and restore of all decks and progress.

## Use it

Open <https://ianheinrich.github.io/pocket-flashcards/>.

To install it:

- **Android:** in Chrome, open the menu (⋮) and choose **Install app** or **Add to Home screen**.
- **Desktop:** click the install icon in the address bar of Chrome or Edge.

Then import a deck. The `examples/` folder has three to start with: `getting-started.md`,
`world-capitals.md` and `chemistry-basics.md`.

## Making decks

A deck is a Markdown file. Each `##` heading is the front of a card, and the text below it is the back.

```markdown
---
deck: Geography / World capitals
tags: [geography]
---

## What is the capital of Australia?

**Canberra**, not Sydney or Melbourne.

## France <-> Paris
```

A `<->` line makes two cards, one in each direction. [docs/deck-format.md](docs/deck-format.md) covers
the whole format, including images and diagrams, and has a ready-made prompt you can paste into any AI
chat to get a deck on any topic.

## Moving between devices

Decks are files, so you import them on each device. Your progress moves with a backup: use
**Settings → Export backup** on one device and **Import backup** on another. Nothing syncs
automatically, by design.

## Privacy

- Decks, cards, review history, settings and imported images are stored in your browser's IndexedDB
  on your device. Nowhere else.
- The app makes no requests to other origins. There is no CDN, no font service and no analytics.
- Images from the web (`https://`) are off by default, because loading one tells that server you are
  looking at the card. You can turn them on in Settings.
- Clearing the site's data in your browser deletes everything, so export backups of decks you care about.

## Self-hosting

The repository is the site. Any static host can serve it as is, with no build step.

To run your own copy on GitHub Pages, fork the repository, then go to **Settings → Pages** and set the
source to **GitHub Actions**. Every push to `main` deploys.

## Development

You need Node 20 or later.

```sh
npm install
npm run serve
```

Then open <http://localhost:8080>.

| Command                     | What it does                                   |
| --------------------------- | ---------------------------------------------- |
| `npm test`                  | Unit tests                                     |
| `npm run lint`              | ESLint and a Prettier check                    |
| `npm run format`            | Prettier, writing files                        |
| `npm run typecheck`         | Type-checks the JSDoc annotations              |
| `npm run serve`             | Serves the app at <http://localhost:8080>      |
| `npm run vendor`            | Copies the pinned Mermaid build into `vendor/` |
| `npm run changelog collect` | Folds `changelog.d/` into `CHANGELOG.md`       |

[docs/architecture.md](docs/architecture.md) explains how the code fits together, and
[CONTRIBUTING.md](CONTRIBUTING.md) explains how to report a bug or send a change.

## License

[MIT](LICENSE)
