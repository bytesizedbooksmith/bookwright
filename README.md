# EPUB Maker 📖

Turn your Markdown manuscripts into publish-ready books — a Windows-friendly,
self-owned alternative to Vellum (Mac-only) and Atticus.

It runs as a **local web app** in your browser (no internet required) with a
**live preview**. From one set of Markdown files it produces:

- **EPUB** for **Amazon KDP**, **Curios**, **BookFunnel** (ARCs/promos), and your **own website**
- **Print-ready PDF** for **paperback/hardback** (KDP / IngramSpark trim sizes)
- **Word (.docx)**, **compiled Markdown**, and a **reading PDF** for reuse elsewhere

One source, one styling system, many outputs — so the preview always matches the export.

---

## Requirements

Already installed on your machine, but for reference:

| Tool | Needed for | Status |
|------|------------|--------|
| **[Pandoc](https://pandoc.org) 3.x** | EPUB / DOCX / HTML generation | **required** |
| **Node.js 20+** | running the app | **required** |
| **Chromium** | PDF export | auto-downloaded by Puppeteer on `npm install` |
| **Java** | full EPUBCheck validation (optional) | optional — structural checks run without it |

---

## Quick start

**Windows (easiest):** double-click **`start.bat`**. The first run installs
dependencies (a few minutes), then every run builds the app and opens it in your
browser.

**Or from a terminal:**

```bash
npm install     # first time only
npm start       # builds the UI, starts the server, opens the browser
```

Then in the app:

1. Click **load the sample book** to try it instantly, or load your own (see below).
2. Pick a **theme** and edit the **book details** — the preview updates live.
3. Manage **front & back matter** (add/remove/reorder); switch the **Preview as** a
   device (Kindle, Kobo, Phone, iPad) to see how it reflows.
4. Under **Export (ebook)** download EPUB (KDP or Universal), Word, Markdown, or a reading
   PDF; under **Print book (PDF)** generate a print-ready interior.

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
```

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
exchange, a sign on a door. EPUB Maker styles these distinctly. Two forms:

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
| **Reading PDF** | PDF | A quick screen/proof PDF — **not** print-ready trim. For uploads, use **Print book (PDF)** below (its file name ends in `-print-…`). |

Both EPUB presets include a **cover**, an **NCX + nav table of contents** (required
by KDP and Kobo), and valid OPF metadata. Files are also written to the
[`output/`](output) folder.

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

## Roadmap

- A custom theme editor, parts/volumes, foot/endnotes, full-bleed image
  support for print, saved projects, and a headless CLI/batch mode.

---

## Developer notes

```bash
npm run dev        # Vite (5173) + API (4242) with hot reload
npm run typecheck  # tsc --noEmit over server + web
npm run build      # build the frontend to web/dist

# Render a book to every format from the command line:
npx tsx server/pipeline/cli.ts samples/clockwork-garden decorative --all
```

**Project layout**

```
server/            Express API + rendering pipeline (Pandoc + Puppeteer)
  pipeline/        ingest, structure, render-{html,epub,docx,markdown,pdf}
  filters/book.lua Pandoc filter: scene breaks + drop caps
  templates/       custom Pandoc HTML template
  validate/        EPUBCheck wrapper + built-in checks
  presets.ts       KDP vs Universal EPUB presets
themes/            base.css + classic/ modern/ decorative/
web/               React + Vite + Tailwind UI
samples/           the bundled sample book
```

## Troubleshooting

- **"pandoc failed" / not found** — ensure `pandoc --version` works in your terminal.
- **PDF export errors** — Puppeteer's Chromium downloads on `npm install`; re-run it
  if the download was interrupted.
- **EPUB "valid (builtin)"** — that's the lightweight checker; install Java for full
  EPUBCheck. Your EPUB is still fine for upload; retailers run their own validation.
