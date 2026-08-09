/* A deterministic copy of the real book for tests to work on.
   Earlier suites copied Bk-1_The-Inn and asserted against whatever its _meta
   happened to hold. That worked exactly once: the first real export adopted the
   hash, set blues_round, and recorded exports, and every assertion pinned to the
   old snapshot then failed. The manuscript is production data and will keep
   moving, so the fixture pins the metadata it needs instead. */
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";

export const REAL_INN = "C:/AI Workspace/Books/Linfield/Series-1_Goose/Bk-1_The-Inn";

/** The hand-seeded shape as it was BEFORE the formatter first took over: a
 *  truncated hash it did not write, no rounds run, no exports recorded. */
function seededVersionFile(hash: string) {
  return {
    book: "The Inn That Wasn't There Yesterday",
    pen_name: "Ada Linfield",
    series: "The Gadding Goose",
    series_index: 1,
    source: REAL_INN,
    current_version: 6,
    current_source_hash: hash,
    blues_round: 0,
    max_rounds: 1,
    max_rounds_note: "Book 1 runs an abbreviated loop.",
    word_count_method: "Whitespace-split tokens of chapter title + subtitle + body.",
    hash_note: "seeded by hand; the formatter adopts this at v6 rather than minting v7.",
    history: [
      { version: 1, first_seen: "2026-06-01", words: 51795, chapters: 26, note: "original draft", reconstructed: true, exports: [] },
      { version: 2, first_seen: "2026-06-10", words: 55188, chapters: 26, note: "editing wing", reconstructed: true, exports: [] },
      { version: 3, first_seen: "2026-06-24", words: 52637, chapters: 26, note: "DeepSeek rewrite", reconstructed: true, exports: [] },
      { version: 4, first_seen: "2026-07-06", words: 52135, chapters: 26, note: "Notion notes applied", reconstructed: true, exports: [] },
      { version: 5, first_seen: "2026-07-21", source_hash: "sha256:8a0ff6264513d11f", words: 52994, chapters: 26, note: "anti-fragment pass", reconstructed: true, exports: [] },
      { version: 6, source_hash: hash, first_seen: "2026-08-08", words: 52294, chapters: 26, note: "MERGE — first unified source of truth.", exports: [] },
    ],
  };
}

export interface Fixture {
  root: string;
  bookDir: string;
  reviewDir: string;
  cleanup: () => Promise<void>;
}

export interface FixtureOptions {
  /** Leave version.json exactly as the real book has it. */
  keepRealMeta?: boolean;
  /** Drop _meta entirely, to exercise seeding a fresh book. */
  noMeta?: boolean;
  /** Pre-set the round counter. */
  bluesRound?: number;
  /** Store a canonical hash instead of the truncated hand-seeded one. */
  canonicalHash?: string;
}

export async function makeBookFixture(opts: FixtureOptions = {}): Promise<Fixture> {
  const root = path.join(os.tmpdir(), `bf-fix-${crypto.randomUUID().slice(0, 8)}`);
  const bookDir = path.join(root, "Bk-1_The-Inn");
  const reviewDir = path.join(root, "Books to Review");

  await fs.cp(REAL_INN, bookDir, {
    recursive: true,
    filter: (s) => !s.includes("_pre-merge-backup") && !s.includes("_superseded"),
  });

  // Point at a throwaway review folder — never the real OneDrive one.
  const yamlPath = path.join(bookDir, "book.yaml");
  const yaml = (await fs.readFile(yamlPath, "utf8")).replace(/^blues_output:.*$/m, "").trimEnd();
  await fs.writeFile(yamlPath, `${yaml}\nblues_output: ${reviewDir.replace(/\\/g, "/")}\n`, "utf8");
  await fs.mkdir(reviewDir, { recursive: true });

  const metaDir = path.join(bookDir, "_meta");
  if (opts.noMeta) {
    await fs.rm(metaDir, { recursive: true, force: true });
  } else if (!opts.keepRealMeta) {
    const vf: Record<string, unknown> = seededVersionFile(
      opts.canonicalHash ?? "sha256:1c970973125889a9a6a6b1f1fd0891c8",
    );
    if (opts.canonicalHash) delete vf.hash_note;
    if (opts.bluesRound !== undefined) vf.blues_round = opts.bluesRound;
    await fs.mkdir(metaDir, { recursive: true });
    await fs.writeFile(path.join(metaDir, "version.json"), `${JSON.stringify(vf, null, 2)}\n`, "utf8");
  }

  return {
    root,
    bookDir,
    reviewDir,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}
