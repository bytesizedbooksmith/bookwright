/* A deterministic, disposable book for tests to work on.
 *
 * Defaults to the sample book bundled with the repo, so the suite runs for
 * anyone who clones it. Point BSBF_TEST_BOOK at a real manuscript folder to run
 * the same checks against a full-length book:
 *
 *     BSBF_TEST_BOOK="D:/books/Bk-1_My-Novel" npm test
 *
 * Nothing here asserts a specific title, word count or chapter count — those are
 * measured from whichever book is in use and handed back as `facts`. Hard-coding
 * them would tie the suite to one person's manuscript, and tie it to a *moment*
 * in that manuscript's life besides.
 *
 * The metadata is pinned rather than copied. An earlier version of these suites
 * copied a real book and asserted against whatever its _meta happened to hold,
 * which worked exactly once: the first genuine export adopted the hash, set the
 * round counter and recorded exports, and eight assertions failed at once.
 */
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import { ROOT } from "../../server/pipeline/paths.ts";
import { loadBook } from "../../server/pipeline/ingest.ts";
import { chaptersOf, countWords } from "../../server/versioning.ts";

/** The book under test. Override with BSBF_TEST_BOOK to use a real manuscript. */
export const TEST_BOOK = process.env.BSBF_TEST_BOOK?.trim() || path.join(ROOT, "samples", "clockwork-garden");
export const USING_BUNDLED_SAMPLE = !process.env.BSBF_TEST_BOOK?.trim();

export interface BookFacts {
  title: string;
  author: string;
  chapters: number;
  words: number;
}

export interface Fixture {
  root: string;
  bookDir: string;
  reviewDir: string;
  /** Title, author, chapter and word counts, measured from this copy. */
  facts: BookFacts;
  /** Chapter files in order — edit one to change the source hash. */
  chapterFiles: string[];
  cleanup: () => Promise<void>;
}

/**
 * A fingerprint of the source book, for proving a suite never wrote back to it.
 *
 * Asserting the source has no `_meta` only holds for a pristine sample — a real
 * manuscript under BSBF_TEST_BOOK has one, and should. What must be true either
 * way is that nothing CHANGED, so compare a snapshot taken before the run.
 */
export async function sourceSnapshot(): Promise<string> {
  const listing = (await fs.readdir(TEST_BOOK)).sort().join("|");
  const read = async (p: string) => fs.readFile(path.join(TEST_BOOK, p), "utf8").catch(() => "<absent>");
  return [listing, await read("_meta/version.json"), await read("_meta/LINEAGE.md"), await read("book.yaml")].join("\n--\n");
}

export interface FixtureOptions {
  /** Drop _meta entirely, to exercise seeding a book the formatter hasn't seen. */
  noMeta?: boolean;
  /** Pre-set the round counter. */
  bluesRound?: number;
  /** Store a canonical hash instead of the truncated hand-seeded one. */
  canonicalHash?: string;
}

/**
 * The shape a version.json has when a person wrote it before the formatter ever
 * ran: a truncated hash it didn't produce, no rounds, no exports. Exercises the
 * adoption path, which must take over at the current version rather than reading
 * the unfamiliar hash as "the source changed".
 */
function seededVersionFile(hash: string, facts: BookFacts, source: string) {
  const gen = (version: number, words: number, note: string) => ({
    version,
    first_seen: `2026-0${version}-01`,
    words,
    chapters: facts.chapters,
    note,
    reconstructed: true,
    exports: [] as unknown[],
  });
  return {
    book: facts.title,
    pen_name: facts.author,
    source,
    current_version: 6,
    current_source_hash: hash,
    blues_round: 0,
    max_rounds: 1,
    max_rounds_note: "One blues round for this book, then the audio pass, then ship.",
    word_count_method: "Whitespace-split tokens of chapter title + subtitle + body.",
    hash_note: "seeded by hand; the formatter adopts this at v6 rather than minting v7.",
    history: [
      gen(1, facts.words - 500, "original draft"),
      gen(2, facts.words + 900, "editing passes"),
      gen(3, facts.words + 300, "model rewrite"),
      gen(4, facts.words - 160, "revision notes applied"),
      { ...gen(5, facts.words - 20, "prose pass"), source_hash: "sha256:8a0ff6264513d11f" },
      {
        version: 6,
        source_hash: hash,
        first_seen: "2026-08-08",
        words: facts.words,
        chapters: facts.chapters,
        note: "first unified source of truth",
        exports: [] as unknown[],
      },
    ],
  };
}

export async function makeBookFixture(opts: FixtureOptions = {}): Promise<Fixture> {
  const root = path.join(os.tmpdir(), `bf-fix-${crypto.randomUUID().slice(0, 8)}`);
  // The Bk-N_ prefix is stripped when deriving the filename stem, so this also
  // exercises that rule on every run.
  const bookDir = path.join(root, `Bk-1_${path.basename(TEST_BOOK)}`);
  const reviewDir = path.join(root, "Books to Review");

  await fs.cp(TEST_BOOK, bookDir, {
    recursive: true,
    filter: (s) => !s.includes("_pre-merge-backup") && !s.includes("_superseded") && !s.includes("_exports"),
  });

  // Always a throwaway review folder — never whatever the real book points at.
  const yamlPath = path.join(bookDir, "book.yaml");
  const yaml = (await fs.readFile(yamlPath, "utf8")).replace(/^blues_output:.*$/m, "").trimEnd();
  await fs.writeFile(yamlPath, `${yaml}\nblues_output: ${reviewDir.replace(/\\/g, "/")}\n`, "utf8");
  await fs.mkdir(reviewDir, { recursive: true });

  const { book } = await loadBook(bookDir);
  const chapters = chaptersOf(book);
  const facts: BookFacts = {
    title: book.meta.title,
    author: book.meta.author,
    chapters: chapters.length,
    words: countWords(chapters),
  };

  const metaDir = path.join(bookDir, "_meta");
  await fs.rm(metaDir, { recursive: true, force: true });
  if (!opts.noMeta) {
    const vf: Record<string, unknown> = seededVersionFile(
      opts.canonicalHash ?? "sha256:1c970973125889a9a6a6b1f1fd0891c8",
      facts,
      bookDir.replace(/\\/g, "/"),
    );
    if (opts.canonicalHash) delete vf.hash_note;
    if (opts.bluesRound !== undefined) vf.blues_round = opts.bluesRound;
    await fs.mkdir(metaDir, { recursive: true });
    await fs.writeFile(path.join(metaDir, "version.json"), `${JSON.stringify(vf, null, 2)}\n`, "utf8");
    // A hand-written LINEAGE with prose above the table, so the append tests can
    // prove the formatter adds rows without disturbing anything already there.
    await fs.writeFile(
      path.join(metaDir, "LINEAGE.md"),
      [
        `# LINEAGE — ${facts.title}`,
        "",
        "Append-only. Nothing above the marker is ever rewritten.",
        "",
        "## A section a person wrote",
        "",
        "Prose that predates the formatter and must survive every append.",
        "",
        "## Export log",
        "",
        "| Date | Ver | Artifact | Words | Note |",
        "|---|---|---|---|---|",
        `| 2026-08-08 | v6 | source | ${facts.words.toLocaleString("en-US")} | first unified source of truth |`,
        "<!-- formatter:insert-rows-above -->",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  // Where the chapters actually live: a subfolder, or the book root itself.
  const cfgChapters = (yaml.match(/^chapters:\s*(.+)$/m)?.[1] ?? ".").trim();
  const chapterDir = path.resolve(bookDir, cfgChapters);
  const chapterFiles = (await fs.readdir(chapterDir))
    .filter((f) => /\.(md|markdown)$/i.test(f) && !f.startsWith("_") && !f.startsWith("."))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((f) => path.join(chapterDir, f));

  return {
    root,
    bookDir,
    reviewDir,
    facts,
    chapterFiles,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}
