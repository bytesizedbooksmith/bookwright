# Changelog

All notable changes to Byte-Sized Book Formatter are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-09-01

### Added
- **Integrated workflow mode** — `?embedded=1&book=...` opens a specified book directly and presents a compact formatter interface for the FPS Alpha workflow app.
- **Blues continuation packets** — chapter-range exports receive a descriptive tag such as `_blues_chapters-6-7`, so multiple packets from the same manuscript version can coexist.

### Changed
- **Publication-aware versioning** — the source hash now covers every input that can affect a publication: ordered sections, book metadata, styles, typography, cover bytes, and custom-font bytes. Machine-specific absolute asset paths remain excluded.
- **Safe hash migration** — an existing book adopts the expanded hash at its current version once, preserving its history instead of minting a false source revision.

### Fixed
- **Same-version continuation archiving** — a tagged Blues packet archives only an older packet with the same tag. It no longer displaces the main packet or a different chapter range.
- **Lockfile release metadata** — package and lockfile versions now agree without altering third-party dependency versions.

## [1.2.0] - 2026-08-09

The theme of this release is **knowing which file is which.** Exports now carry the
version of the manuscript they came from, land in a known folder instead of
Downloads, and archive whatever they supersede. Alongside that, a new **blues**
export for reading and marking up a draft by hand.

### Added
- **Blues export** — a wide-margin markup PDF built to be read and annotated on a
  tablet. US Letter with a **2.5 in right margin that stays permanently blank**,
  14 pt serif set ragged right and unhyphenated, chapters only, and a
  `Ch 4 · p 61` footer on every page so a location can be read aloud while
  dictating notes. The cover page is generated from the book's own version
  record — version, date, word and chapter count, source folder, review round.
  Covers the first ~50 pages by default, stopping on a chapter boundary.
  Available in the export panel and as `npm run blues`.
- **Version tracking across every format** — the chapter Markdown is hashed
  before each export. The version increments when *the book* changes, not when an
  export runs, so a blues, an EPUB and a print PDF made from one untouched source
  all carry the same version. Recorded in `_meta/version.json`, with an
  append-only `_meta/LINEAGE.md` you can add your own rows to.
- **Export destinations, naming, and archiving** — files are named
  `{slug}_v{N}_{date}[_variant].{ext}` (version first, so name order is version
  order). Everything but the blues goes to the book's `_exports/`; the blues goes
  to a review folder your tablet can see, set from the export panel. Superseded
  files move to `_archive/` and **nothing is ever deleted**, so the top of an
  output folder holds only current files.
- **`npm test`** — the regression suite (235 checks over nine areas) now lives in
  `tests/` and runs from one command. See [tests/README.md](tests/README.md).
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
- **Exports are written where they belong, not downloaded** — when a book is
  opened from a folder on disk, the server writes each export to that book's own
  folder and the app shows the path. A browser download can't choose where it
  lands, so it always went to Downloads, and the version record would then name a
  path with nothing at it. Drag-and-dropped books, which have no permanent home,
  still download.
- **Renamed from "Bookwright" to "Byte-Sized Book Formatter"** — the previous
  name conflicted with a registered business. All user-facing strings, the
  package name (`byte-sized-book-formatter`), the dev env vars
  (`BOOK_FORMATTER_DEV` / `BOOK_FORMATTER_NO_OPEN`), and internal identifiers
  were updated.

### Fixed
- **Stray Markdown could become a chapter** — most books set `chapters: .`, which
  makes the book folder itself the chapters folder, and every `.md` file in it was
  read as a chapter. A loose `copyright.md` was already being published as the
  final chapter of two books. Sidecar and matter filenames are now skipped, an
  `exclude:` list is available for anything else, and both skipped files and
  oddly-named ones are reported instead of passing silently.
- **The EPUB preset did nothing** — KDP and Universal produced byte-identical
  files, because the "don't embed fonts" flag was read and discarded. KDP now
  ships without embedded fonts, as intended, which is what keeps the per-MB
  delivery fee down.
- **Drop caps sat below the first line of text** — a floated cap aligns its box to
  the top of the line, but the glyph sits on its baseline with the ascender above
  it, so the capital landed about two-thirds of a line low. The PDF paths now
  measure each cap against the font that actually resolved and seat it exactly;
  the correction can't be a constant because it depends on the font.
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
foot/endnotes, full-bleed image support for print, saved projects, and batch
generation across books.

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

[Unreleased]: https://github.com/bytesizedbooksmith/byte-sized-book-formatter/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/bytesizedbooksmith/byte-sized-book-formatter/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/bytesizedbooksmith/byte-sized-book-formatter/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/bytesizedbooksmith/byte-sized-book-formatter/releases/tag/v1.1.0
[1.0.0]: https://github.com/bytesizedbooksmith/byte-sized-book-formatter/releases/tag/v1.0.0
