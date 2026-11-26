# Changelog fragments

Each pull request adds one file here, named for the change in kebab case,
such as `search-by-tag.md`. The file holds one or more `### Added`,
`### Changed`, `### Fixed` or `### Removed` headings, each followed by `- `
bullets. A bullet says what a user sees or can now do.

```markdown
### Added

- Search finds cards by tag as well as by text.
```

`npm run changelog collect` folds the files into `CHANGELOG.md` and deletes
them. `npm run changelog check` validates them. This README is never folded.
