# Byte-Sized Book Formatter 📖

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node 20+](https://img.shields.io/badge/node-20%2B-brightgreen.svg)
![Version](https://img.shields.io/badge/version-1.2.0-informational.svg)

**A Markdown book formatter for indie authors.** Turn your manuscripts into
publish-ready books — a Windows-friendly, self-owned alternative to Vellum
(Mac-only) and Atticus.

It runs as a **local web app** in your browser (no internet required) with a
**live preview**. From one set of Markdown files it produces:

- **EPUB** for **Amazon KDP**, **Curios**, **BookFunnel** (ARCs/promos), and your **own website**
- **Print-ready PDF** for **paperback/hardback** (KDP / IngramSpark trim sizes)
- **Blues** — a wide-margin markup PDF built to be read and annotated on a tablet
- **Word (.docx)**, **compiled Markdown**, and a **reading PDF** for reuse elsewhere

One source, one styling system, many outputs — so the preview always matches the export.

Every export is stamped with the version of the manuscript it came from, and lands
in a known folder rather than in Downloads — so "which file is the latest?" has an
answer. See [Versions and where exports go](#versions-and-where-exports-go).

---

## Requirements

| Tool | Needed for | |
|------|------------|--|
| **Node.js 20+** | running the app | **required** |
| **[Pandoc](https://pandoc.org) 3.x** | EPUB / DOCX / HTML generation | **required** |
| **Chromium** | all PDF export | installed by Puppeteer — see below |
| **Java** + [EPUBCheck](https://www.w3.org/publishing/epubcheck/) | retailer-grade EPUB validation | optional — structural checks run without it |

On Windows, [winget](https://learn.microsoft.com/windows/package-manager/) handles
the first two:

```bash
winget install OpenJS.NodeJS.LTS JohnMacFarlane.Pandoc
```

---

## Quick start

```bash
git clone https://github.com/bytesizedbooksmith/byte-sized-book-formatter.git
cd byte-sized-book-formatter
npm install
npx puppeteer browsers install chrome
npm start
```

`npm start` builds the UI, starts the local server, and opens it in your browser.
Nothing is uploaded anywhere — the app runs entirely on your machine.

> **Why the extra Chromium step?** npm 10+ blocks package install scripts by
> default, so Puppeteer's browser download often doesn't run. If PDF export fails
> with a Chromium error, that command is the fix. On Windows you can also just
> double-click **`start.bat`**, which installs dependencies on first run.

Then in the app:

1. Click **load the sample book** to try it instantly, or load your own (see below).
2. Pick a **theme** and edit the **book details** — the preview updates live.
3. Manage **front & back matter** (add/remove/reorder); switch the **Preview as** a
   device (Kindle, Kobo, Phone, iPad) to see how it reflows.
4. Under **Export (ebook)** generate EPUB (KDP or Universal), Word, Markdown, a reading
   PDF, or a [blues](#blues--the-markup-pdf); under **Print book (PDF)** generate a
   print-ready interior. Files are written into your book's folder, and the panel
   shows you where.

The sidebar sections are **collapsible** — click a heading to fold it away.

---

## Three ways to load your book

| Method | How | Best for |
|--------|-----|----------|
| **Open a folder on disk** *(recommended)* | Click **📁 Choose folder…** to pick it in the Windows folder dialog (or paste the path). The app reads files straight from disk; edit/swap them in your own editor and click **↻ Reload**. | The real workflow — editing files and templates and seeing the result. |
| **Open book folder… / drag-drop** | Pick or drop a folder; the app works on a copy. | Quick one-offs. |
| **Open .md file…** | A single Markdown file, split into chapters on each `# Heading`. | Fast jobs with no front/back matter. |

Because the app runs locally, the folder-on-disk option gives it direct read/write
access — your edits flow through on **Reload**, and templates you add land as real
files in your folder.

### Saving your book details

The **title page** is generated automatically from the Book Details fields (title, subtitle,
author, series, publisher) — you never type it by hand. The **copyright page** can be
generated too, but for full control over wording and paragraphs, use **Add → Copyright** under
Front &amp; back matter and edit it as a Markdown file (then remove the generated one with ✕).
Click **Save details to book.yaml** under Book Details to write those fields into
your folder's `book.yaml`, so they persist and you don't re-enter them. (If the folder
has no `book.yaml` yet, saving creates one; your front/back matter and chapter order are
preserved.)

---

## How to structure your book

You can hand the app **either**:

### A. A single Markdown file
It's split into chapters on each top-level `# Heading`. Metadata can be set in the
app (or via YAML front matter at the top of the file). Simplest for quick jobs.

### B. A book folder with a `book.yaml` (recommended)
Gives you front matter, back matter, cover, and ordering. Layout:

```
my-book/
  book.yaml
  cover.png
  frontmatter/
    dedication.md
    epigraph.md
  chapters/
    01-the-letter.md
    02-the-garden.md
  backmatter/
    about-the-author.md
```

See the working example in [`samples/clockwork-garden/`](samples/clockwork-garden).

### `book.yaml` reference

```yaml
title: The Clockwork Garden
subtitle: A Novel
author: Eleanor Vance
series: The Tinkerer's Trilogy
series_index: 1
publisher: Bramblewood Press
language: en
isbn: "978-1-7384521-0-6"      # optional — a UUID is generated if omitted
description: >
  Back-cover blurb...
copyright: |
  Copyright © 2026 Eleanor Vance. All rights reserved.
cover: cover.png                # relative to this file
theme: decorative               # classic | modern | decorative

frontmatter:                    # "titlepage" & "copyright" are auto-generated;
  - titlepage                   # anything else is a path to a Markdown file
  - copyright
  - frontmatter/dedication.md
chapters: chapters              # a folder (filename order) OR a single .md file
backmatter:
  - backmatter/about-the-author.md

# --- Where exports go (optional) ---
exports_dir: _exports                                 # relative to this folder
blues_output: C:/Users/you/OneDrive/Books to Review   # absolute; set it in the app
slug: the-inn                                         # filename stem; defaults to the folder name

# --- Files in the chapters folder that aren't chapters (optional) ---
exclude:
  - "ZZZ-*.md"
```

`chapters: .` is common — it makes the book folder itself the chapters folder. In
that case anything ending in `.md` sitting beside your manuscript is a chapter
candidate, so the formatter skips a few by name: files starting with `_` or `.`,
`LINEAGE.md`, `README.md`, `NOTES.md`, `CHANGELOG.md`, `TODO.md`, and the front/back
matter names (`copyright.md`, `dedication.md`, and so on). Anything it skips is
reported as a warning, and anything it keeps that doesn't match the folder's usual
naming pattern is flagged too — so a stray note never quietly becomes your last
chapter. Use `exclude:` for anything else.

### Markdown conventions

- **Chapter title** — a top-level heading: `# The Letter`
- **Scene break** — a line of `* * *` (or `***`). It becomes the theme's ornament.
- **Emphasis** — `*italic*`, `**bold**`; block quotes with `>`.
- **Front/back-matter files** may start with YAML front matter to control display:

  ```markdown
  ---
  title: Dedication      # used for the navigation TOC
  class: dedication      # styling hook (dedication, epigraph, about-author, …)
  toc: false             # hide from the TOC
  ---

  For everyone who ever took a clock apart…
  ```

---

## Embedded documents (letters, journals, texts…)

Fiction is full of *things characters read*: a letter, a diary entry, a text-message
exchange, a sign on a door. Byte-Sized Book Formatter styles these distinctly. Two forms:

**Block** — a whole document set off on its own, with a fenced `:::` block:

```markdown
::: letter
Dear Margaret,

The garden is yours now. Wind it gently — it frightens easily.

[— C. A.]{.signature}
:::

::: journal
14th of October. The lilies will not keep time, however I wind them.
:::

::: text
**Etta:** Are you there?
**Bramble:** The kettle is warm.
:::
```

**Inline** — a few words *woven into the prose* (so it gets its own look instead of being
mistaken for ordinary emphasis):

```markdown
The book grew warm. [You'll have made a mess of it,]{.journal} said the aunt's hand.
```

Recognised types (aliases in parentheses): **letter**, **journal** (diary), **text**
(message, sms, chat), **note**, **telegram**, **sign** (inscription), **verse** (poem).
Extras: `[— Name]{.signature}` right-aligns a letter's sign-off; inside a **text** block,
a `**Name:**` prefix labels the speaker and the bubbles alternate sides automatically.

### Custom fonts

By default these render with sensible system fonts (e-readers may substitute). To make a
journal look like *real handwriting everywhere* — including Kindle — embed your own font in
`book.yaml` and assign it to a style:

```yaml
fonts:
  - file: fonts/ShadowsIntoLight.ttf   # put the font file in your book folder
    family: Handwriting
styles:
  journal:
    font: Handwriting                  # journal/diary text uses it
  note:
    font: Handwriting
```

Fonts are **embedded in the EPUB** and **inlined into the PDF**, so they look the same in
every format and on every device. (The bundled sample uses the open-licensed *Shadows Into
Light* font in `samples/clockwork-garden/fonts/`.) `styles` entries also accept `size`,
`color`, and `align`. Use fonts you're licensed to embed.

---

## Front & back matter

Open a book **folder on disk** and the **Front & back matter** panel lets you build
out your book without hand-editing config:

- **+ Add** a section from a template — Dedication, Epigraph, Foreword, Preface,
  Acknowledgments, About the Author, Also By, Newsletter, Sneak Peek, or a Custom one.
- Each entry is a real Markdown file written into your folder's `frontmatter/` or
  `backmatter/` directory (templates live in [`templates/matter/`](templates/matter)).
- **Reorder** with ↑ ↓ and **remove** with ✕ (removing unlists it; the file stays).
- **Edit the prose** in your own editor, then click **↻ Reload** to see it.

Title page and copyright are generated from your metadata (shown as "generated").
If the folder has no `book.yaml`, adding matter creates one for you.

---

## Themes

| Theme | Look |
|-------|------|
| **Classic** | Traditional serif, small-caps centered chapter titles |
| **Modern** | Sans-serif, block paragraphs, bold left chapter titles |
| **Decorative** | Serif with drop caps and a ❧ floral ornament between scenes |

Themes are plain CSS in [`themes/`](themes) (shared `base.css` + a per-theme file),
so they're easy to tweak or extend.

### Typography

The **Typography** panel (and a `typography:` block in `book.yaml`) overrides the theme
per book — body & heading font, drop caps on/off, the scene-break ornament, and the chapter
title's size / case / alignment / style:

```yaml
typography:
  bodyFont: Garamond          # a system font, or a family from `fonts:` (embedded)
  headingFont: Handwriting
  dropcap: false              # override the theme's default
  sceneOrnament: "❦"
  chapterTitle:
    size: "1.7em"
    case: smallcaps           # normal | smallcaps | uppercase
    align: center             # left | center | right
    style: italic             # normal | italic
```

A body/heading font listed under `fonts:` is **embedded** (renders everywhere, including
Kindle); a plain system-font name is a *suggestion* that e-readers may substitute. Changes
preview live; **Save typography to book.yaml** persists them.

---

## Preview as a device

Above the preview, **Preview as** switches the layout into a device frame — **Kindle**
and **Kobo** (e-ink look), **Phone** (Apple Books), **iPad**, or **Fit width**. This shows
how your text *reflows* at each screen width (and an e-ink tint for the e-readers). It's a
representative approximation, not a per-device rendering engine — every reading app lays
text out slightly differently, which is exactly why EPUB is reflowable.

There's also a **🖨 Print** view: it paginates your book with the *same* engine as the
print PDF and shows the actual pages — trim size, margins, running heads, page numbers, and
recto chapter openings — so you can check the print layout before generating the file.
Changing any option in the **Print book (PDF)** panel updates this preview. (It runs Paged.js
in Chromium, so it takes a few seconds to refresh.)

---

## Export targets

| Button | Format | Where it's for |
|--------|--------|----------------|
| **EPUB · Amazon KDP** | EPUB 3 | KDP upload. Reader-controlled fonts, relative sizing, small file (keeps the per-MB delivery fee down). |
| **EPUB · Universal** | EPUB 3 | Curios, BookFunnel, your own site. Standards-clean, kept under ~23 MB for BookFunnel email delivery. |
| **Word (.docx)** | DOCX | Editors, collaborators, other tools. |
| **Compiled Markdown** | MD | One clean file for reuse in other projects. |
| **Reading PDF** | PDF | A quick screen/proof PDF — **not** print-ready trim. For uploads, use **Print book (PDF)** below. |
| **Blues (markup PDF)** | PDF | Reading and marking up on a tablet. See [Blues](#blues--the-markup-pdf). |

Both EPUB presets include a **cover**, an **NCX + nav table of contents** (required
by KDP and Kobo), and valid OPF metadata.

When your book was opened from a folder on disk, the app **writes each export to
that book's own folder** and shows you the path. Only drag-and-dropped books, which
have no permanent home, come back as a browser download.

### Validation

After an EPUB export the app reports validation results. With **Java** installed and
an [EPUBCheck](https://www.w3.org/publishing/epubcheck/) jar placed in
`vendor/epubcheck/epubcheck.jar`, it runs the official validator. Without Java it
runs built-in structural checks (mimetype, OPF metadata, TOC presence). KDP and Kobo
also validate on upload.

---

## Print book (PDF)

The **Print book (PDF)** panel produces a print-ready interior PDF via Paged.js +
Chromium — the same theme styling as your ebook, paginated for paper:

- **Trim sizes**: 5×8, 5.25×8, 5.5×8.5, 6×9, and 8.5×11 in / Letter (KDP / IngramSpark standards)
- **Printed Table of Contents** — a Contents page (after the copyright page) listing chapters with page numbers and dotted leaders
- **Page numbers restart at Chapter 1** — front matter (title, copyright, contents, dedication, epigraph) and back matter carry no running head or page number; auto-inserted blank pages stay blank
- **Mirrored margins + page-count-aware gutter** — the inner (binding) margin scales with
  the book's length to meet KDP's requirements, with extra for **hardcover**. The panel
  shows a live page-count + gutter estimate; the exact gutter is locked in at export.
- **Header & footer layouts** — choose what the running head shows (Author/Title, or
  Title/Chapter) and where the page number sits (bottom-center or top-outer corner)
- **Recto chapter openings** (chapters start on a right-hand page; blanks inserted as needed)
- Chapter titles drop down the page, with no running head on the opening page; the title
  page and copyright page carry no header or folio

Generate it, upload the interior to KDP/IngramSpark, and create your cover wrap in the
provider's cover tool (cover-spine-cover wraps depend on final page count and paper).

---

## Blues — the markup PDF

A **blues** is your manuscript rendered to be *written on*: read it on a tablet with
a stylus, away from the computer, and mark it up by hand. (The name is borrowed from
print production, where "blues" were the last proofs before a job went to press.)

It is not the reading PDF and not the print PDF. Everything about it serves two jobs:

- **Room to write** — a **2.5 in right margin that stays permanently blank.** Nothing
  renders there: no page numbers, no notes, no ornaments.
- **A location you can say out loud** — every page carries `Ch 4 · p 61` in the footer,
  so you can dictate "chapter four, page sixty-one…" into a recording instead of
  stopping to type.

US Letter, 14 pt serif, ragged right and unhyphenated (justified text opens rivers of
white space, and on a marked-up page a river reads as a pencil stroke). Chapters only —
no front or back matter, since nobody revises a copyright page on a tablet. No drop
caps, no decoration, no hyperlinks: they compete with handwriting.

**Page one is the version.** The cover is generated, never typed — title, author,
version, date, word and chapter count, source folder, and which review round this is.
That page is what answers "didn't I already fix this?"

By default a blues covers the **first ~50 pages**, stopping on a chapter boundary
rather than mid-chapter. That is deliberate: the point is to diagnose what's
*systematically* wrong and hand that back for a whole-book fix, not to build a
400-item list of individual corrections.

It goes to its own folder — wherever your tablet can see it — so that folder becomes
your to-do list. Set it the first time from the **Blues** block in the export panel,
or in `book.yaml` as `blues_output:`.

### From the command line

```bash
npm run blues -- --book "C:/path/to/Bk-1_The-Inn"
```

```
✓ The Inn That Wasn't There Yesterday — BLUES v6 (round 1 of 1)
  44 pages · chapters 1–4 of 26
  → OneDrive\Books to Review\the-inn_v6_2026-08-09_blues.pdf
  archived v5
```

| Flag | Effect |
|---|---|
| `--book <path>` | Source book folder (required) |
| `--out <path>` | Override the destination for this run |
| `--pages 50` | Stop after about N pages, never mid-chapter (default 50) |
| `--new-round` | Increment the round counter |
| `--note "<text>"` | Text for the `LINEAGE.md` Note column |
| `--chapters 5-26` | Only a chapter range — an escape hatch, not the usual path |
| `--yes` | Don't ask before regenerating a file that already exists |

---

## Versions and where exports go

Exports go stale the moment they're written. The Markdown is the book; everything
else is a dated snapshot of it. So the formatter keeps track of which snapshot is
which, and never edits one.

**One version number per book, shared by every format.** Before each export the
chapter Markdown is hashed. If it changed, the version goes up; if it didn't, the
version stays and the new file is recorded against it. Export a blues, an EPUB and a
print PDF without touching a word in between and all three read `v6`, because they
are all v6.

Two files in the book's `_meta/` folder hold this:

- **`version.json`** — the current version, the source hash, the round counter, and
  the history of every version with the artifacts made from it.
- **`LINEAGE.md`** — the same story in a table you can read, **append-only**. Add
  your own rows by hand for things the formatter didn't do ("DeepSeek rewrite",
  "revision notes applied") and they live alongside the automatic ones.

### Filenames and archiving

```
{slug}_v{N}_{YYYY-MM-DD}[_{variant}].{ext}

the-inn_v6_2026-08-09_blues.pdf
the-inn_v6_2026-08-09_print.pdf
the-inn_v6_2026-08-09_kdp.epub
the-inn_v6_2026-08-09.epub          ← universal
```

Version first, so sorting by name sorts by version. Everything except the blues goes
to the book's `_exports/` folder; the blues goes to your review folder, because it's
the one artifact that has to travel to another device.

Before writing, anything it supersedes moves to `_archive/` beside it. **Nothing is
ever deleted** — not even when a name collides inside the archive. The result is the
rule that makes this work: **the top level of an output folder holds only current
files, one per format.**

Regenerating a format at a version that already exists asks first, since from an
unchanged source you'd be making the same file twice.

---

## Roadmap

- A custom theme editor, parts/volumes, foot/endnotes, full-bleed image
  support for print, saved projects, and batch generation across books.

---

## Developer notes

```bash
npm run dev        # Vite (5173) + API (4242) with hot reload
npm run typecheck  # tsc --noEmit over server + web
npm run build      # build the frontend to web/dist
npm test           # the regression suite (see tests/README.md)
npm run blues -- --book <path>

# Render a book to every format from the command line:
npx tsx server/pipeline/cli.ts samples/clockwork-garden decorative --all
```

**Project layout**

```
server/            Express API + rendering pipeline (Pandoc + Puppeteer)
  pipeline/        ingest, structure, render-{html,epub,docx,markdown,pdf,print,blues}
  pipeline/dropcap.ts  seats drop caps by measuring the resolved font
  filters/book.lua Pandoc filter: scene breaks + drop caps
  templates/       custom Pandoc HTML template
  validate/        EPUBCheck wrapper + built-in checks
  presets.ts       KDP vs Universal EPUB presets
  blues.ts         blues page geometry + @page CSS
  versioning.ts    source hashing, version.json, LINEAGE.md
  destinations.ts  filenames, routing, archive-on-write
  exporter.ts      the one path every export takes
  cli-blues.ts     npm run blues
themes/            base.css + print-base.css + blues-base.css + classic/ modern/ decorative/
web/               React + Vite + Tailwind UI
tests/             regression suite — npm test
samples/           the bundled sample book
output/            scratch for ad-hoc renders (gitignored, safe to delete)
```

## Troubleshooting

- **"pandoc failed" / not found** — check that `pandoc --version` works in your
  terminal, and that it reports 3.x.
- **PDF export fails with a Chromium error** — the browser download didn't run.
  `npx puppeteer browsers install chrome` fixes it. (npm 10+ blocks package install
  scripts by default, so this is common on a fresh clone or a new machine.)
- **EPUB says "valid (builtin)"** — that's the lightweight checker. For the official
  validator, install Java and put an [EPUBCheck](https://www.w3.org/publishing/epubcheck/)
  jar at `vendor/epubcheck/epubcheck.jar`. Your EPUB is still fine to upload either
  way; retailers run their own validation.
- **A note or README turned into a chapter** — books using `chapters: .` treat the
  book folder as the chapters folder. Common sidecar names are skipped
  automatically and anything unusual is reported as a warning; add anything else to
  `exclude:` in `book.yaml`.
- **"No review folder set"** — a blues needs somewhere to go. Set it from the
  **Blues** block in the export panel, or as `blues_output:` in `book.yaml`.

---

## Contributing

Issues and pull requests are welcome. Before opening a PR:

```bash
npm run typecheck
npm test           # 235 checks over nine areas — see tests/README.md
```

The suite drives real Chromium renders, real Pandoc, and a real server, so it takes
a couple of minutes. `tests/README.md` documents the conventions that keep it honest.

---

## License

Released under the [MIT License](LICENSE) — free to use, modify, and
redistribute (including commercially); just keep the copyright notice. Fork it
and make it your own.

Version history is tracked in [CHANGELOG.md](CHANGELOG.md). There's also a
[full user guide](docs/Byte-Sized-Book-Formatter-Guide.html) covering everything
here in more depth.
