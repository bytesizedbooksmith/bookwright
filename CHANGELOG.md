# Changelog

All notable changes to Byte-Sized Book Formatter are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Chapter subtitles** — a chapter can carry a second line under its title (a
  point-of-view name, location, or tagline). Write it as a `## ` heading directly
  beneath the chapter's `#` title, or set `subtitle:` in the chapter file's
  front-matter. Styled per theme (Classic small caps, Modern light left-aligned,
  Decorative copper small caps), kept out of the table of contents, and carried
  into the HTML, EPUB, and DOCX output.
- **Book subtitle in ebook & Word metadata** — the book's `subtitle:` now reaches
  the EPUB OPF (as a `dc:title` main/subtitle refinement) and the Word title
  block (a Subtitle-styled line), and is styled per theme on the title page.
  Previously it appeared only on the generated title page.
- **Pandoc preflight check** — the app verifies Pandoc 3.x at startup (with a
  clear banner if it is missing or too old) and reports its status at
  `/api/health`, instead of failing only on the first export.

### Changed
- **Renamed from "Bookwright" to "Byte-Sized Book Formatter"** — the previous
  name conflicted with a registered business. All user-facing strings, the
  package name (`byte-sized-book-formatter`), the dev env vars
  (`BOOK_FORMATTER_DEV` / `BOOK_FORMATTER_NO_OPEN`), and internal identifiers
  were updated.

### Fixed
- **Drop caps now work in every theme** — the drop-cap toggle was styled only in
  the Decorative theme, so it did nothing on Classic and Modern. All three themes
  now render a drop cap, and the Decorative cap is re-seated onto the baseline.
- **Print honors your type settings** — the print PDF now respects the Typography
  font-size and line-height overrides, which were previously ignored because of
  stylesheet ordering.
- **Readable margins on every trim** — print margins now scale with the trim
  size, so wide trims (e.g. 8.5×11 in) no longer produce an unreadably wide text
  column.
- **Actionable export errors** — a missing or outdated Pandoc, a malformed
  `book.yaml`, or a Chromium launch failure now produce clear, specific messages
  (with the right HTTP status) instead of a generic error such as
  `spawn pandoc ENOENT`.

Planned (see the README roadmap): a custom theme editor, parts/volumes,
foot/endnotes, full-bleed image support for print, saved projects, and a
headless CLI/batch mode.

## [1.1.0] - 2026-06-22

### Changed
- **Rebranded from "EPUB Maker" to "Bookwright"** — repositioned as a Markdown
  *book formatter* (not just an EPUB tool), with updated descriptions throughout.

### Added
- **Printed Table of Contents** for print PDFs — a Contents page after the
  copyright page, listing chapters with page numbers and dotted leaders.
- **Page-number restart at Chapter 1** — front matter (title, copyright,
  contents, dedication, epigraph) and back matter carry no running head or
  folio; auto-inserted blank pages stay blank.
- **Letter (8.5×11 in) trim size** added to the print trim options.

### Fixed
- EPUB front-matter generation fixes.

## [1.0.0]

### Added
- Initial release (as "EPUB Maker"): local web app with live preview that turns
  one set of Markdown files into multiple outputs.
- **EPUB** export for Amazon KDP, Curios, BookFunnel, and self-hosting, with
  built-in structural validation.
- **Print-ready PDF** export via Paged.js + Chromium, with KDP/IngramSpark trim
  sizes, mirrored margins, page-count-aware gutter, and recto chapter openings.
- **Word (.docx)**, compiled Markdown, and reading-PDF exports.
- Theme styling system shared across preview and all exports.

[Unreleased]: https://github.com/bytesizedbooksmith/byte-sized-book-formatter/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/bytesizedbooksmith/byte-sized-book-formatter/releases/tag/v1.1.0
[1.0.0]: https://github.com/bytesizedbooksmith/byte-sized-book-formatter/releases/tag/v1.0.0
