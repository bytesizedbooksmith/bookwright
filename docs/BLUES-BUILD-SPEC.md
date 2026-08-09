# Blues Export — Build Spec

**For:** Claude Code, working in `C:\AI Workspace\code\book-formatter`
**Requested by:** Angie (Byte-Sized Booksmith)
**Status:** v1 spec, not yet built
**Date:** 2026-08-08

---

## What we're building and why

A **blues** is a markup PDF: the manuscript rendered for reading and hand-annotation on an iPad with an Apple Pencil, away from the computer.

It is not the reading PDF and not the print PDF. Those exist to be read comfortably or to be printed. The blues exists to be **written on**, and to **carry its own version identity on its face** so that "didn't I already fix this?" is answerable by looking at the cover page.

This is the human revision step of the editing pipeline. Everything about the format serves two goals:

1. **Room to write.** A wide, permanently blank right margin.
2. **Sayable location.** Every page announces its chapter and page number, because the author reads notes aloud into a transcript — "chapter four, page sixty-one, the line that starts with…" — and that transcript is what gets handed back to the machine.

Do not add features that serve neither goal.

---

## PHASE 0 — Restore and verify. This is a gate.

This is a **new PC** and the repo was moved. **Do not write a single line of new feature code until every check below passes.** Report status, fix what's broken, confirm green, and only then proceed to Phase 1.

Building a new export mode on top of a half-working PDF pipeline produces bugs that look like blues bugs and aren't. That debugging session is the most expensive thing in this project and it is entirely avoidable.

### Toolchain

| Check | Command | Required for |
|---|---|---|
| Node 20+ | `node --version` | everything |
| Clean install | `npm install` | everything |
| **Pandoc 3.x** | `pandoc --version` | EPUB, DOCX, HTML |
| **Puppeteer Chromium** | `node -e "console.log(require('puppeteer').executablePath())"` then confirm the file exists on disk | **all PDF output** |
| Java *(optional)* | `java -version` | full EPUBCheck validation |
| Typecheck | `npm run typecheck` | — |
| App boots | `npm start` serves and opens without error | — |

Pandoc and Puppeteer's Chromium are the two most likely casualties of a machine migration. Chromium in particular lives in a user-profile cache that does not travel — if the path prints but the file is missing, reinstall it.

### Pipeline regression

Render the sample book (`samples/clockwork-garden`) through **every existing output** and confirm each one produces a valid file:

- EPUB (KDP and Universal)
- Print PDF
- Reading PDF
- DOCX
- Compiled Markdown

Diff against `output/baseline` where a baseline exists. Any pre-existing failure gets fixed and reported before Phase 1 begins.

### Report format

```
PHASE 0 — TOOLCHAIN
  node ................ ✓ v20.x
  pandoc .............. ✗ not on PATH — installed 3.6, re-verified ✓
  chromium ............ ✓
  ...
PHASE 0 — PIPELINE
  epub (kdp) .......... ✓ matches baseline
  print pdf ........... ✓
  ...
STATUS: GREEN — proceeding to Phase 1
```

---

## The governing principle — read before Deliverable 2

> *"I just assumed the .md files were the latest and I could create a new ePub or PDF when I needed it, because those are immediately old once I've exported."*

That instinct is correct and it becomes the design rule:

**The Markdown is the book. Every export — blues, EPUB, print PDF, DOCX — is a dated snapshot that is stale the moment it is written.**

Therefore:

1. Exports are never edited. Ever. Editing happens in Markdown, full stop.
2. Every export is **stamped with the version of the source it came from**, on its face where possible and in its filename always.
3. **One version number per book, shared by every artifact type.** Blues v4, EPUB v4, and print PDF v4 all came from the same source state, and you can prove it by hash. This is what makes "which one is latest?" a question with an answer.
4. The version increments when **the source Markdown changes**, not when an export runs. Exporting twice from unchanged source produces two files at the same version.
5. Exports never land in Downloads. They land in one known place, per book.

---

## Deliverable 1 — the `blues` theme

New theme alongside `classic` / `modern` / `decorative`. It is a **screen-and-Pencil** theme, not a print theme, so it should build on `print-base.css` conventions (paged media, running heads) rather than the ebook CSS.

### Page geometry

| Property | Value | Why |
|---|---|---|
| Page size | US Letter portrait (8.5 × 11 in) | Close enough to iPad's 4:3 to fill the screen; no odd trim math |
| Top / bottom margin | 0.75 in | |
| Left margin | 0.9 in | |
| **Right margin** | **2.5 in, always blank** | The writing gutter. Nothing renders here — no page numbers, no notes, no ornaments |
| Body text width | remainder (~5.1 in) | Narrow measure is a feature; short lines are easier to mark |

The right margin is the single most important property in this spec. Nothing may encroach on it.

### Type

- Serif body, 14pt, line-height 1.6
- **Ragged right, no hyphenation.** Justified text opens rivers of white space down the page, and on a marked-up page a river reads as a pencil stroke. Hyphenation does the same at the line end. (From the Blues Loop SOP — the body CSS justifies by default, so the blues has to override it)
- Paragraph indent, no space between paragraphs (standard fiction setting)
- Scene breaks render as a centered `* * *` — plain, no decorative ornament
- Chapter openers start a new page, chapter title at 20pt, no drop caps, no flourishes
- Generous widow/orphan control

Keep it plain. Decoration competes with handwriting.

### Running head (every page)

Left-aligned, 9pt, muted grey, above the text block:

```
The Inn That Wasn't There Yesterday · Ada Linfield · BLUES v4 · 2026-08-08
```

### Running foot (every page)

Left-aligned, 9pt, muted grey, below the text block. **Must not extend into the right margin.**

```
Ch 4 · p 61
```

The chapter number here is the chapter the page *starts in*. This is load-bearing — it's how the author names a location out loud.

### Cover page

First page, no running head or foot. Centered block:

```
        THE INN THAT WASN'T THERE YESTERDAY
                  Ada Linfield

                    BLUES v4
                   2026-08-08

              26 chapters · 52,994 words
       source: Books/Linfield/Series-1_Goose/Bk-1_The-Inn
                  round 1 of 3
```

Everything on this page is generated, never typed. The version number, date, and round counter come from `version.json` (Deliverable 2).

### Table of contents

Second page. Chapter number, chapter title, page number. One line each. This is for orientation, not navigation — no hyperlinks.

### Explicitly excluded

- Line numbers (the author locates by reading the line aloud, not by number)
- Front matter and back matter (copyright, dedication, about-the-author — none of it gets revised on the iPad)
- Cover image
- Hyperlinks of any kind
- Any content in the right margin

---

## Deliverable 2 — unified version tracking (applies to ALL exports, not just blues)

### `version.json`

Lives at **`{book}/_meta/version.json`** — see Deliverable 2b for why not the root. Owns the version number for **every** artifact the formatter produces from this book.

```json
{
  "book": "The Inn That Wasn't There Yesterday",
  "pen_name": "Ada Linfield",
  "source": "C:/AI Workspace/Books/Linfield/Series-1_Goose/Bk-1_The-Inn",
  "current_version": 4,
  "current_source_hash": "sha256:9f2c…",
  "blues_round": 1,
  "max_rounds": 3,
  "history": [
    {
      "version": 4,
      "source_hash": "sha256:9f2c…",
      "first_seen": "2026-08-08T09:14:00-04:00",
      "words": 52994,
      "chapters": 26,
      "note": "blues round 1",
      "exports": [
        { "type": "blues", "file": "the-inn_v4_2026-08-08_blues.pdf",  "at": "2026-08-08T09:14:00-04:00" },
        { "type": "epub",  "file": "the-inn_v4_2026-08-08.epub",       "at": "2026-08-08T09:20:00-04:00" }
      ]
    }
  ]
}
```

### Versioning rules

**On every export of any type**, before rendering:

1. Hash the concatenated chapter Markdown files.
2. If the hash **differs** from `current_source_hash` → increment `current_version`, open a new history entry, record the new hash.
3. If the hash **matches** → keep the current version and append to that entry's `exports` array.

That's the whole mechanism. The version tracks *the book*, not the export run. Three artifacts generated from the same untouched source all read v4, because they are all v4.

When the source is unchanged and the requested artifact already exists, print:

```
source unchanged since v4 — the-inn_v4_2026-08-08.epub already exists. Regenerate? [y/N]
```

### Rounds (blues only)

- `blues_round` increments only when `--new-round` is passed. A round is one full **read → dictate → machine-rewrite** cycle. Regenerating a blues inside the same round bumps the version, not the round.
- If `blues_round` would exceed `max_rounds`, **print a loud warning and continue.** The cap is a discipline, not a lock:

```
⚠  ROUND 4 OF 3. The cap exists because rounds have diminishing returns.
   Remaining issues at this point are judgment calls, and judgment calls ship.
```

### `LINEAGE.md`

Also at **`{book}/_meta/LINEAGE.md`**. Human-readable, append-only, never rewritten:

```markdown
| Date | Version | Artifact | Words | Note |
|---|---|---|---|---|
| 2026-08-08 | v4 | blues | 52,994 | round 1 |
| 2026-08-08 | v4 | epub  | 52,994 | |
```

The `Note` column takes free text via `--note`, so events the formatter didn't cause ("DeepSeek rewrite", "Notion revision notes applied", "ElevenReader hand-edit pass") can be logged into the same table by hand. **This file is the answer to "didn't I already fix this?"**

---

## Deliverable 2b — harden chapter ingestion (BUG FIX, do this first)

**There is a live bug in `server/pipeline/ingest.ts` and it must be fixed before the metadata files land anywhere near a book folder.**

`listMarkdown()` does a flat `readdir` and accepts **every** `.md` file in the directory with no exclusion list:

```ts
const entries = await fs.readdir(dir);
return entries
  .filter((e) => /\.(md|markdown)$/i.test(e))
  .sort(...)
```

Many book folders — including `Bk-1_The-Inn` — set `chapters: .`, so the book root *is* the chapters directory. Any stray Markdown file dropped in that folder silently becomes a chapter. `LINEAGE.md` would have been ingested and sorted **after chapter 26**, appearing as the final chapter of the book, in the EPUB, on Amazon.

Notes files, READMEs, drafts, scratch — every one of them is the same landmine.

### The fix

`listMarkdown()` must skip:

1. Any filename beginning with `_` or `.`
2. A reserved-names list, case-insensitive: `LINEAGE.md`, `README.md`, `NOTES.md`, `CHANGELOG.md`, `TODO.md`
3. Anything matching an optional `exclude:` glob list in `book.yaml`

When a file is skipped, **emit a warning** so a genuinely mis-named chapter doesn't vanish without a trace:

```
⚠ skipped 3 non-chapter files in chapters dir: LINEAGE.md, README.md, _scratch.md
```

### Belt and braces

Metadata still lives in `_meta/` rather than the book root. Two independent protections, because this failure mode is silent, ships to a store, and is embarrassing.

**Regression test:** drop a file named `ZZZ-notes.md` into a book folder with `chapters: .`, render an EPUB, confirm it is excluded and warned about — and that a file named `chapter-27.md` is still included.

**As built:** rules 1 and 2 cannot recognise an arbitrary name like `ZZZ-notes.md`, and a rule that could would also eat a legitimate `prologue.md` — the exact over-reach the `chapter-27.md` half of this test exists to prevent. So the stray is still ingested, but it is no longer *silent*: any file that survives the filters and doesn't match the folder's dominant naming pattern is named in a warning, and `exclude:` removes it for good. Silence was the failure mode; that is what got fixed.

---

## Deliverable 3 — output destinations, naming, and archiving

**No export ever lands in Downloads again.** There are exactly two destinations, and which one an artifact goes to depends on whether a human needs to carry it somewhere.

### Destination A — the book's own `_exports/` (everything except blues)

EPUB, print PDF, reading PDF, DOCX, compiled Markdown. These stay with the book.

```
Bk-1_The-Inn/
  chapter-01.md …      ← the book. the only thing that is ever edited.
  book.yaml
  frontmatter/
  _meta/
    version.json
    LINEAGE.md
  _exports/
    the-inn_v4_2026-08-08.epub
    the-inn_v4_2026-08-08_print.pdf
    the-inn_v4_2026-08-08_reading.pdf
    the-inn_v4_2026-08-08.docx
    _archive/
      the-inn_v3_2026-07-21.epub
```

### Destination B — OneDrive review folder (blues only)

The blues is the one artifact that must physically travel to another device, so it goes where the iPad can see it.

```
C:/Users/mrocz/OneDrive/Books to Review/
  the-inn_v4_2026-08-08_blues.pdf
  irregular-harvest_v2_2026-08-15_blues.pdf
  _archive/
    the-inn_v3_2026-07-21_blues.pdf
```

Configured in `book.yaml`, overridable with `--out`:

```yaml
exports_dir: _exports                                    # relative to book folder
blues_output: C:/Users/mrocz/OneDrive/Books to Review    # absolute
```

### Filename convention — one pattern, all artifacts

```
{slug}_v{N}_{YYYY-MM-DD}[_{variant}].{ext}
```

Version first, then date. Sorting by name sorts by version; sorting by date works too. Variants: `_blues`, `_print`, `_reading`, `_kdp`, `_universal`. No variant suffix for EPUB-universal and DOCX.

### Archive-on-write — both destinations

Before writing, move any **older-version** file of the same book and same artifact type into that destination's `_archive/`. Create `_archive/` if absent. **Never delete anything, ever.**

Same-version files are overwritten in place after the confirm prompt — v4 regenerated is still v4.

The result is the rule that makes this whole thing work: **the top level of any output folder contains only current artifacts.** If four books sit in `Books to Review`, there are four PDFs, and that folder *is* the to-do list.

---

## Deliverable 4 — the CLI

The primary interface. This has to run without opening the web UI, because the web UI is on the computer and the computer is where the distraction lives.

```bash
npm run blues -- --book "C:/AI Workspace/Books/Linfield/Series-1_Goose/Bk-1_The-Inn"
```

Flags:

| Flag | Effect |
|---|---|
| `--book <path>` | Source book folder (required) |
| `--out <path>` | Override output dir |
| `--new-round` | Increment the round counter |
| `--note "<text>"` | Text for the LINEAGE.md Note column |
| `--chapters 5-26` | Generate only a chapter range. An escape hatch, not part of the method — see below |
| `--pages 50` | **Stop after approximately N pages.** Defaults to 50 |
| `--yes` | Don't ask before regenerating an artifact that already exists |

### The `--pages` flag

This is a deliberate constraint, not a convenience. The method is: read a fixed budget of pages, diagnose the *systemic* problems, hand the whole manuscript back to the machine. Reading the entire book is the failure mode this whole system exists to prevent.

`--pages 50` renders complete chapters until the page count would exceed 50, then stops — never mid-chapter — and prints the range on the cover page:

```
              round 1 of 3 · pages 1–52 of ~310
```

**Default: 50.** Per the Blues Loop SOP, a blues is *always* the first ~50 pages of the book, starting at page 1 — never the whole book, and normally not a slice from the middle. Fifty pages, six problems, one handoff, whole book fixed. The uncapped full-book render is the thing the cap exists to prevent, so it is not the default; pass a large `--pages` if you ever genuinely want it.

`--chapters` remains available for the unusual case (a book whose opening has already been hand-worked, so the first 50 pages would under-diagnose), but it is a departure from the method and the SOP does not use it.

### Console output

On success, print exactly:

```
✓ The Inn That Wasn't There Yesterday — BLUES v4 (round 1 of 3)
  52 pages · chapters 1–6 of 26
  → OneDrive\Books to Review\the-inn_v4_2026-08-08_blues.pdf
  archived v3
```

The filename follows the one convention in Deliverable 3 — version first, then date, then variant.

Nothing else. No progress bars, no verbose logging on the happy path.

---

## Deliverable 5 — web UI button

Secondary. Add **Blues (markup PDF)** as an export option in the existing export panel, with a page-cap field and a round-increment checkbox. Same code path as the CLI.

---

## Acceptance tests

### Gate — Phase 0

0. Every toolchain check green and every existing output renders from the sample book. **Nothing below is attempted until this passes.**

### Blues format, against `Bk-1_The-Inn`

1. `npm run blues -- --book <inn> --pages 50 --new-round` produces a PDF in the OneDrive review folder
2. The PDF opens on the iPad in Files → Preview, and Apple Pencil annotation saves back in place
3. Every page has a running head with version + date, and a running foot with `Ch N · p N`
4. **The right 2.5 inches of every single page is empty.** Check the longest paragraph in the book and the chapter opener pages specifically
5. The cover page reports the correct version, round, word count, chapter count, and page range
6. `--pages 50` stops on a chapter boundary, never mid-chapter
7. Front matter and back matter are absent from the output

### Ingestion hardening (Deliverable 2b)

7b. Drop `ZZZ-notes.md` into a book folder using `chapters: .`, render an EPUB → excluded, and a warning naming it is emitted
7c. `chapter-27.md` in the same folder → **still included.** The filter must not over-reach
7d. Render `Bk-1_The-Inn` → 26 chapters, and nothing from `_meta/` appears anywhere in the output

### Versioning, across artifact types

8. `_meta/version.json` and `_meta/LINEAGE.md` exist and are correct
9. Export a blues, then an EPUB, then a print PDF **with no source edits between them** → all three filenames read `v4`, and all three appear under the same history entry
10. Change one word in one chapter, export again → version increments to v5, a new history entry opens, the recorded hash changes
11. Re-export an artifact at an unchanged version → the confirm prompt fires
12. Older-version artifacts moved to `_archive/`; nothing deleted; only current artifacts at the top level of both destinations
13. Round 4 attempt prints the warning and proceeds

### No regressions

14. Re-render the sample book through EPUB / print PDF / reading PDF / DOCX / compiled Markdown and diff against `output/baseline`. Existing behavior unchanged except for the new naming and destination.

---

## Out of scope for v1

Named so nobody builds them by accident:

- OCR or handwriting recognition of the marked-up PDF (the author dictates from her marks; the PDF is never machine-read)
- Round-tripping annotations back into Markdown
- Syncing or uploading anything (the formatter writes to a local folder; OneDrive handles transport)
- Multi-book batch generation
- Any integration with Notion, ElevenReader, or the editing wing

v1 makes a beautiful, well-labelled, wide-margined PDF and writes down what version it is. That's all.
