# Tests

```bash
npm test              # everything, slowest last
npm test -- blues     # only suites whose filename matches
```

By default these run against the sample book in `samples/`, so they work on a
fresh clone. To run the same checks against a full-length manuscript:

```bash
BSBF_TEST_BOOK="D:/books/Bk-1_My-Novel" npm test
```

Nothing asserts a specific title, word count or chapter count — those are
measured from whichever book is in use. A three-chapter sample and a
twenty-six-chapter novel both have to pass.

These are plain scripts, not a test framework. They drive real Chromium renders,
real Pandoc, and a real Express server, because most of what can break here is
layout and file placement — things a mocked unit test would happily agree with
while the PDF came out wrong. Each check prints a sentence, so a failure reads as
a claim that stopped being true rather than a stack trace.

| Suite | Covers |
|---|---|
| `ingestion` | Which files count as chapters, and the EPUB font presets |
| `versioning` | Source hashing, version increments, rounds, LINEAGE |
| `destinations` | Filenames, routing, archive-on-write |
| `review-folder` | Setting the blues destination from the app |
| `dropcap` | Drop cap seating across themes and cap sizes |
| `web-export` | The export API: server-writes vs download fallback |
| `acceptance` | The build spec's acceptance criteria, incl. no-regressions |
| `blues-format` | Page geometry, the gutter, running head and foot, `--pages` |
| `cli` | `npm run blues` end to end, as a subprocess |

## Rules that keep these honest

**Never touch the real books.** Every suite works on a disposable copy from
`fixtures/book.ts` and asserts at the end that the real manuscript and the real
review folder were untouched — a real manuscript under BSBF_TEST_BOOK is live production data.

**Pin the fixture, don't inherit production state.** `fixtures/book.ts` rewrites
`_meta/version.json` to a known shape. Earlier versions of these suites copied
the real book and asserted against whatever its metadata happened to hold — which
worked exactly once. The first genuine export adopted the hash, set the round
counter and recorded exports, and eight assertions failed at once. The code was
fine; the tests had baked in a snapshot of a moving thing.

**Count, don't just `.every()`.** `[].every(...)` is `true`, so a selector that
matches nothing passes silently. That is how a broken drop-cap assertion sat
green while the cover rendered flush left. Assert the count too.

**Compare structure, not bytes.** EPUB and DOCX are zips carrying a timestamp;
the date digits shift the deflate output by a byte or two across days, and PDFs
move when anything reflows. `fixtures/pipeline-reference.json` holds entry names
and uncompressed sizes from the commit this work started at, so "no regressions"
means the structure matches — not that two files are identical.

**No named functions inside `page.evaluate`.** esbuild (via tsx) rewrites them to
call a `__name` helper that does not exist in the browser, and puppeteer's
isolated world cannot see a shim installed on the page. Pass anonymous callbacks
straight to `map`/`forEach`, or inline the logic.
