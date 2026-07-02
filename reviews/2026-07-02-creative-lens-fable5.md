# Creative / Typographic Review — book-formatter theme system

- **Reviewer:** Claude (Fable 5), creative-lens pass
- **Date:** 2026-07-02
- **Scope:** Design-level assessment from source only. **No rendered output exists on disk** (`D:\code\book-formatter\output\` is absent; nothing has been exported), so every judgment below is read off the CSS, the Pandoc template, the Lua filter, and the sample book — not off proofs. Items that genuinely require a rendered page are flagged **[needs rendered proof]**.

**Files reviewed:**
`D:\code\book-formatter\themes\base.css`, `themes\classic\theme.css`, `themes\modern\theme.css`, `themes\decorative\theme.css`, `themes\print-base.css`, `server\pipeline\themes.ts`, `server\templates\book.html`, `server\filters\book.lua`, `server\print.ts`, `server\pipeline\render-print.ts`, `server\pipeline\render-html.ts`, `server\pipeline\render-epub.ts`, `server\pipeline\render-docx.ts`, `server\pipeline\doc-css.ts`, `server\pipeline\build-doc.ts`, `server\pipeline\ingest.ts`, `server\matter.ts`, `server\presets.ts`, `web\src\components\TypographyPanel.tsx`, `web\src\components\ThemePicker.tsx`, `samples\clockwork-garden\*`, `templates\matter\*`.

---

## 1. Overall verdict

The **structural craft is genuinely good** — better than most first-pass book formatters. `themes\base.css` gets the invisible conventions right: indented paragraphs with no inter-paragraph gap (`p { margin: 0; text-indent: 1.25em }`), flush first paragraphs after headings and scene breaks (`h1 + p, .scene-break + p … { text-indent: 0 }`, base.css:93–99), justified text with the last-line-stretch bug fixed (`text-align-last: left`, base.css:47–50), `widows: 2; orphans: 2`, hyphenation on, recto chapter openings, mirrored margins with a KDP-band-aware gutter (`server\print.ts:74–79`), unnumbered front matter with folios restarting at 1, and a printed TOC with dotted leaders. The embedded-document system (letters, journals, chat bubbles with alternating sides via `book.lua` `Div()`) is a real differentiator — Vellum and Atticus don't ship chat bubbles.

The **visible design layer is thin**. The three theme files total ~130 lines; a theme currently means: a font stack, one chapter-title rule, one back-matter-title rule, and a scene-break color. Everything a reader would call "the design of this book" — the title page, chapter-number treatment, running heads, drop-cap metrics — is either generic shared CSS or hard-coded outside the theme layer. The result reads as *clean and competent, but anonymous*: closer to "well-set Pandoc output" than to a designed trade book.

---

## 2. Theme-by-theme judgment

### Classic (`themes\classic\theme.css`)
- **Body face:** `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif` (lines 5–8). Tasteful and pragmatic — Iowan Old Style is Apple Books' house default, Palatino Linotype covers Windows, Georgia covers everything else. Genre-appropriate for general/literary fiction. **Good.**
- **Chapter title:** centered small caps, `letter-spacing: 0.08em`, `1.6em`, `margin: 0 0 1.8em` (lines 10–17). Understated and professional in shape. Two caveats: (a) `font-variant: small-caps` will be **synthesized** (scaled capitals) on nearly every fallback font in that stack — real `smcp` glyphs aren't present in Palatino Linotype or Georgia. Synthesized small caps at display size is a classic amateur tell to a designer's eye, though most readers won't consciously notice. **[needs rendered proof]** (b) There is **no chapter-number treatment** — see §4.
- **Scene break:** `* * *` letterspaced `0.6em`, `color: #333` (lines 33–36). Fine and conventional; the hard-coded near-black is a minor night-mode hazard (§5, item 8).
- **Verdict:** the strongest of the three. Would pass as a professional trade paperback interior *if* the print measure and title-page issues below were addressed.

### Modern (`themes\modern\theme.css`)
- **Body face:** `"Helvetica Neue", "Segoe UI", system-ui …` sans, `line-height: 1.6`, block paragraphs (`p { text-indent: 0; margin: 0 0 1em }`, lines 11–15).
- **The core problem:** a **fully sans-serif, block-paragraph, *justified* body**. `base.css:38` sets `text-align: justify` on `body` and Modern never resets it, so you get justified sans block paragraphs with auto-hyphenation — the typographic register of a corporate PDF or a web page, not a novel. Real "modern" book design (including Vellum's contemporary themes) keeps a serif or humanist text face for the body and reserves the sans for display. If the sans body is intentional (e.g. for non-fiction/self-help), it should be **rag-right** (`text-align: left`), because Chromium/e-reader justification without proper H&J makes justified sans look gappy. **This is the most significant aesthetic misstep in the theme set.**
- **Chapter title:** `2em`, weight 700, left, `letter-spacing: -0.01em` (lines 17–24) — fine, appropriately assertive.
- **Scene break:** `•   •   •` in `#999` (lines 39–42) — `#999` risks dropping out on e-ink and in low-quality print grayscale. `#777` or plain `currentColor` at reduced opacity would be safer. **[needs rendered proof]**
- **Verdict:** reads as an app screen, not a book page. Needs either a serif body or a deliberate rag-right non-fiction identity.

### Decorative (`themes\decorative\theme.css`)
- **Body face:** `"Hoefler Text", Baskerville, "Palatino Linotype", …` (lines 5–8). Hoefler Text and Baskerville are effectively Mac-only, so on Windows/Kindle this theme silently *becomes* Classic's Palatino look — the two themes will be near-indistinguishable in body text for most of the actual audience. Fine as a stack, but the theme's identity rests entirely on the ornament and drop cap.
- **Chapter title:** italic `1.75em` centered with a `❧` flourish generated by `h1::after` in `#b0894a` (lines 10–26). Charming, genre-appropriate for cozy/romantic/historical. The `content: "❧"` glyph depends on the fallback font supplying U+2767 — on some e-readers this renders as a tofu box. An SVG/image ornament option would be safer. **[needs rendered proof]**
- **Drop cap** (lines 29–36): `float: left; font-size: 3.4em; line-height: 0.74; padding: 0.02em 0.09em 0 0; color: #7a3b2e`.
  - The arithmetic doesn't land on a baseline: the cap's line box is 3.4em × 0.74 ≈ **2.5 body-ems** tall against body lines of 1.5em (preview) or 1.4em×11pt (print) — i.e. the cap bottoms out *between* line 2 and line 3. A proper drop cap sits its baseline exactly on the 2nd or 3rd text baseline; this one will float slightly off, the single most recognizable amateur drop-cap tell. CSS `initial-letter` (now supported in Chromium ≥110, which powers the print path) would solve this exactly for print; the float version can stay as the EPUB fallback but its numbers need per-font tuning. **[needs rendered proof — this is the #1 thing to check on paper]**
  - Kindle Enhanced Typesetting and older ADE handle floats erratically; the float cap may render as a merely-large inline letter on device. **[needs rendered proof on-device]**
  - No **small-caps run-in** after the cap (first 3–5 words in small caps/letterspaced caps) — the traditional companion treatment that both Vellum and Atticus apply. Without it the cap looks orphaned.
  - Credit where due: the Lua filter's handling of an opening quotation mark riding along with the dropped initial (`book.lua:67–105`, including flattening Pandoc `Quoted` nodes) is *genuinely sophisticated* — that's the correct traditional treatment and most tools get it wrong.
- **Verdict:** the right instincts (ornament, colored cap, italic display) but the execution details — cap metrics, ornament glyph dependency, Mac-only face — are where a designer would spot the seams.

### Shared base (`themes\base.css`) — quiet strengths and gaps
- Strengths: `text-align-last` discipline for centered blocks (lines 59–78); preview measure `max-width: 34em` ≈ 65–70 characters (line 84) — textbook-correct; EPUB cover height chain for ADE (lines 11–33); sensible epigraph/dedication/copyright defaults.
- Gaps: no `h2`/`h3` design at all beyond `font-weight: normal` (weak hierarchy for anything but straight fiction); no footnote, figure/caption, table, or part styling anywhere in `themes\` (verified by grep); epigraph attribution is styled identically to the quotation (both italic blockquotes, lines 188–198) where trade convention sets the attribution smaller, roman, or right-aligned.

---

## 3. Print layer (`themes\print-base.css` + `server\print.ts`)

What's right: 11pt/1.4 body (print-base.css:21–25) is a reasonable trade default; chapter openings drop 1.6in (line 35); `break-after: avoid` on headings; running-head suppression on chapter openers (`@page chapter:first`, print.ts:183); italic recto / letterspaced roman verso heads (print.ts:141–142) is a nice classical touch; truly blank inserted blanks; DOM-based folio restart at chapter 1 with matching TOC numbers (`render-print.ts:84–115`) is pragmatic engineering.

What a designer would flag:

- **Fixed side margins regardless of trim** (`server\print.ts:99–101`: `top: 0.7, bottom: 0.7, outer: 0.55` always). At 6×9 with an auto gutter of ~0.625in the measure is ~4.83in ≈ 29 picas ≈ 70–75 characters at 11pt — wide but tolerable. At **8.5×11 the measure is ~7.3in ≈ 105–120 characters — unreadable as a single column**, and the trim is offered in the UI (`server\print.ts:15`). Margins (and ideally body size) must scale with trim.
- **User body size/leading is silently overridden in print.** `doc-css.ts:89–92` emits `body { font-size: …; line-height: … }` (no `!important`) from `typography.fontSize`/`lineHeight`; but `render-print.ts:59–63` injects `print-base.css` (with its own `body { font-size: 11pt; line-height: 1.4 }`) at the **end of `<head>`**, after the Pandoc-embedded CSS. Equal specificity, later wins → the print PDF ignores the author's size/leading. Font *family* survives only because doc-css uses `!important` for it.
- **Running-head furniture is theme-blind**: `Georgia … 9.5pt; color: #444` hard-coded (`server\print.ts:107`) — a Modern (sans) book gets Georgia running heads and folios. Heads/folios should inherit the theme's display or body face.
- **No roman-numeral folios for front matter** — front matter is simply unnumbered (`@page front` blanks all margin boxes, print.ts:174–176). Fine for a novel with a 4-page front; wrong for a book with a real foreword/preface.
- No baseline-grid alignment across facing pages, no control of hyphen ladders or justification quality — this is the hard ceiling of the Chromium/Paged.js engine vs. Vellum's custom typesetter and InDesign. Honest position: acceptable for KDP fiction, visible to a print designer. **[needs rendered proof — check rivers and consecutive-hyphen ladders in a full-length paginated proof]**
- `@page chapter:first` and the flex-border TOC leaders (print-base.css:89–96) both rely on Paged.js behaviors that are historically fragile. **[needs rendered proof]**

---

## 4. Coverage gaps that hurt the reading experience

Roughly in order of pain:

1. **No chapter-number treatment.** There is no concept of "Chapter 7" as a designed element (number above title, small-caps label, ornamented numeral). The H1 is whatever the author typed (`build-doc.ts:27`). This is *the* signature element of Vellum/Atticus chapter openings and the most visible thing missing from every theme.
2. **No parts/volumes.** No `part` section kind (`types.ts:22–27`), no part-opener page. (Acknowledged in README roadmap, line 334.)
3. **No foot/endnote styling or plumbing.** Pandoc would happily emit footnotes; nothing in `themes\` or the filter handles them (grep-verified), no EPUB pop-up (`epub:type="footnote"`) support, no print footnotes. (Roadmap-acknowledged.)
4. **Title page is a design orphan** — see §5 item 4. Also: no half-title, no publisher-logo image slot (`ingest.ts:115–125` builds text-only), no series/"also-by" title-page verso.
5. **Images:** `img { max-width: 100% }` is the entirety of image design (base.css:215–218, print-base.css:47–49). No figure/caption styles, no full-bleed for print (roadmap), no break-inside protection for figures.
6. **Chapter subtitles** aren't representable (a `## subtitle` after the H1 just renders as an unstyled h2).
7. **DOCX export is unstyled** — "Uses Pandoc's default styles for now" (`render-docx.ts:7`); no `--reference-doc`, so the Word output matches no theme at all.
8. **Trim list** (print.ts:10–16) omits 5.06×7.81 (a standard KDP size) and all A-format/B-format/A5 international trims.

---

## 5. Ranked issues (severity-ordered)

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | **High** | **Drop-cap toggle is broken on 2 of 3 themes.** The UI offers "Drop caps: On" for any theme (`TypographyPanel.tsx:120–128`); the Lua filter dutifully wraps the initial in `span.dropcap` (`book.lua:48–49`), but `.dropcap` is styled **only** in `themes\decorative\theme.css:29` (grep-verified — no rule in base.css, classic, or modern). On Classic/Modern the "drop cap" renders as a plain letter. A `.dropcap` fallback belongs in `base.css`, tuned per theme. |
| 2 | **High** | **Print ignores `typography.fontSize`/`lineHeight`** due to CSS injection order (`render-print.ts:59–63` appends print-base *after* doc.css; `print-base.css:21–25` re-declares `body` size/leading; `doc-css.ts:89–92` has no `!important` on those). Authors cannot change print body size/leading at all — the schema advertises it (`types.ts:65–66`) and the README documents the block. |
| 3 | **High** | **Fixed print margins regardless of trim** → 8.5×11 produces a ~7.3in / 105–120-char measure; even 6×9 sits at the loose edge (~70–75 chars). `server\print.ts:99–101`, `print.ts:10–16`. |
| 4 | **High** | **Title page has no theme personality.** All themes share base.css:140–166 — title at UA-default h1 size with `font-weight: normal` forced (base.css:101–104), i.e. essentially unstyled; Decorative contributes *zero* title-page rules; Classic/Modern only touch `.tp-author`. The book's face is its most generic page — the single biggest visible gap vs. Vellum, where the title page is the theme's set piece. |
| 5 | **Medium-High** | **Drop-cap metrics don't seat on a baseline** (3.4em × 0.74 ≈ 2.5 lines; `decorative\theme.css:29–36`); float caps degrade unpredictably on Kindle/ADE; no `initial-letter` for the print path; no small-caps run-in after the cap. **[needs rendered proof]** |
| 6 | **Medium-High** | **Modern's justified sans block-paragraph body** reads as web copy, not a book (`modern\theme.css:5–15` + `base.css:38`). Give it a serif body or switch to rag-right. |
| 7 | **Medium** | **No chapter-number/label treatment** in any theme (§4.1). |
| 8 | **Medium** | **Hard-coded colors are night-mode/e-ink hazards:** `.msg.me { background: #d9efd6 }` and `rgba(0,0,0,.07)` bubbles (base.css:299–334) can become unreadable or invisible in dark mode; `.sign` border `rgba(0,0,0,.35)` (base.css:346–355) disappears on black; `#999` Modern ornament may drop out on e-ink; `#7a3b2e`/`#b0894a` decorative accents go murky in night mode. **[needs on-device proof]** |
| 9 | **Medium** | **Running heads/folios hard-coded to Georgia 9.5pt `#444`** for every theme (`server\print.ts:107`). |
| 10 | **Medium** | **Synthesized small caps** in Classic titles and `.sign` blocks — no real `smcp` in the fallback stacks. **[needs rendered proof]** |
| 11 | **Medium** | **DOCX unstyled** (`render-docx.ts:7–8`); front-matter folios absent rather than roman (print.ts:174–176). |
| 12 | **Low** | Epigraph attribution undifferentiated from quote (base.css:188–198); `❧` ornament glyph availability on e-readers (`decorative\theme.css:20`); journal cursive fallbacks are Windows-centric (`base.css:272`, mitigated by font embedding); `body { margin: 0 5% }` in EPUB contradicts KDP's "let the reader control margins" guidance (base.css:35–36); `text-align-last` unsupported on older RMSDK readers (graceful). |

---

## 6. How it compares to Atticus / Vellum

**Competitive or better:**
- Structural conventions (first-line indents, scene-break spacing, recto starts, blank-page handling, folio restart) are at parity with both.
- **KDP-band-aware auto-gutter with post-pagination re-render** (`render-print.ts:128–137`) is smarter than Atticus's static margins.
- **Embedded documents** (letters/journals/telegrams/signs/verse/chat bubbles with sender-alternation, plus per-style custom embedded fonts via `book.yaml → styles:`) exceeds both tools' stock capability — this is the product's most defensible creative feature.
- Drop-cap quote-handling logic in `book.lua` is more typographically correct than Atticus's.
- Sane, transparent file-based theming (plain CSS) — tweakable in a way Vellum will never be.

**Falls short:**
- **3 thin themes vs. Vellum's ~24 fully-designed theme sets / Atticus's dozens.** More importantly, a Vellum theme specifies the *whole* design (title page, chapter opener with number treatment, ornaments as drawn artwork, running-head style, block-quote/verse styling); here a theme is ~40 lines touching two headings and an ornament color.
- Chapter openers: no numbers, no ornament artwork, no image-behind-title options.
- Print engine ceiling: no baseline alignment, basic justification, no hyphenation ladders control — Vellum's typesetter visibly wins on dense pages. **[needs rendered proof to quantify]**
- No parts, notes, styled DOCX, figure handling, international trims.
- Title page anonymity (item 4 above) — the first page an author compares side-by-side with Vellum output, and the one this system loses most clearly.

---

## 7. Theming recommendation (question 4)

**The bigger win is (a) — but only as "deeper theme contract, then more themes." Not more knobs.**

Reasoning:

1. **The bottleneck is theme *depth*, not theme *count* or control *count*.** All three themes ride on one generic skeleton; the elements that make a book look designed (title page, chapter opener with number treatment, running-head style, drop-cap metrics, ornament artwork) are either shared-generic or hard-coded outside the theme layer (`server\print.ts:107` FONT constant is the clearest symptom). Adding five more 40-line themes multiplies anonymity; adding one *deep* theme contract fixes every theme at once.
2. **More exposed controls (b) is the Atticus trap.** Authors given twelve sliders produce worse pages than a designer's defaults — the audited output here is already *most* professional exactly where the author has no say. The controls that already exist are nearly the right set; the fixes needed are (i) repair the broken ones (issues #1, #2) and (ii) expose the two schema fields that exist but have no UI — `fontSize` and `lineHeight` (`types.ts:65–66` vs. `TypographyPanel.tsx`, which never renders them). Stop there.
3. **Saved custom themes (c) is cheap and worth doing *after* (a), not instead.** The `typography:` block in `book.yaml` already *is* a serializable theme delta; "save as my theme" is mostly persistence plumbing over the existing override system (`doc-css.ts:84–111`). Its value is capped until the underlying contract is rich enough that a saved theme can differ meaningfully from the built-ins.

**Concrete sequence to inform the code-side design:**
1. Extend `ThemeConfig` (`server\pipeline\themes.ts:3–9`) from `{ ornament, dropcap }` to a full design spec: chapter-opener layout (number treatment: none / "Chapter N" label / numeral-above-title), title-page treatment, running-head font/style, drop-cap metrics (or `initial-letter` values) per face, front/back-matter title style, per-theme `print.css` (the loader hook already exists and is unused — `paths.ts:23–25`, `render-html.ts:19–21`).
2. Fix issues #1–#4 in the ranked list within that refactor (they're all consequences of the shallow contract).
3. Ship 2–3 *genre-targeted* themes on the new contract (e.g. a romance/cozy serif with ornament artwork, a thriller with condensed sans display over a serif body — replacing Modern's sans body, and a non-fiction theme with real h2/h3 hierarchy and rag-right).
4. Then add "duplicate & save as custom theme" as a persistence layer over the same spec.

---

## 8. What a rendered proof must verify (cannot be judged from source)

1. Drop-cap baseline seating and Kindle/ADE float behavior (issue #5).
2. Justification quality, rivers, and hyphen ladders across a full-length 6×9 proof.
3. Paged.js fidelity: `@page chapter:first` head suppression, TOC leader alignment, margin-box folios, recto blanks.
4. Small-caps synthesis appearance at title size (issue #10).
5. Night-mode/e-ink behavior of every hard-coded color (issue #8).
6. `❧` and ornament-glyph coverage on Kindle/Kobo fallback fonts.
7. Page-count estimate vs. actual (`print.ts:64–68` calibration) and the resulting gutter band.
