# Changelog

All notable changes to Bookwright are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/bytesizedbooksmith/bookwright/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/bytesizedbooksmith/bookwright/releases/tag/v1.1.0
[1.0.0]: https://github.com/bytesizedbooksmith/bookwright/releases/tag/v1.0.0
