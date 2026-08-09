// The blues CLI — the primary interface.
//
//   npm run blues -- --book "C:/AI Workspace/Books/.../Bk-1_The-Inn"
//
// This has to run without opening the web UI, because the web UI is on the
// computer and the computer is where the distraction lives. So the happy path
// prints five lines and nothing else: no progress bars, no logging.

import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { loadBook } from "./pipeline/ingest.ts";
import { renderBlues } from "./pipeline/render-blues.ts";
import { closeBrowser } from "./pipeline/render-pdf.ts";
import { currentRound, ensureRoundStarted, finishExport, prepareExport } from "./exporter.ts";
import { roundWarning } from "./versioning.ts";
import { isAppError } from "./errors.ts";

interface Args {
  book?: string;
  out?: string;
  note?: string;
  chapters?: { from: number; to: number };
  pages?: number;
  newRound: boolean;
  yes: boolean;
  help: boolean;
}

const USAGE = `
  npm run blues -- --book <path> [options]

  --book <path>      Source book folder (required)
  --out <path>       Override the output folder
  --new-round        Increment the round counter
  --note "<text>"    Text for the LINEAGE.md Note column
  --chapters 1-6     Generate only a chapter range
  --pages 50         Stop after approximately N pages, never mid-chapter
  --yes              Don't ask before regenerating an existing file
`;

function parseArgs(argv: string[]): Args {
  const a: Args = { newRound: false, yes: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--book":
        a.book = next();
        break;
      case "--out":
        a.out = next();
        break;
      case "--note":
        a.note = next();
        break;
      case "--new-round":
        a.newRound = true;
        break;
      case "--yes":
      case "-y":
        a.yes = true;
        break;
      case "--help":
      case "-h":
        a.help = true;
        break;
      case "--pages": {
        const v = Number(next());
        if (!Number.isFinite(v) || v < 1) throw new Error(`--pages needs a positive number.`);
        a.pages = Math.floor(v);
        break;
      }
      case "--chapters": {
        const raw = (next() ?? "").trim();
        const m = raw.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
        if (!m) throw new Error(`--chapters expects a number or a range like 1-6 (got "${raw}").`);
        const from = Number(m[1]);
        const to = m[2] ? Number(m[2]) : from;
        if (to < from) throw new Error(`--chapters range runs backwards: ${raw}`);
        a.chapters = { from, to };
        break;
      }
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return a;
}

/** Shorten a path for display: OneDrive\Books to Review\… rather than C:\Users\… */
function displayPath(p: string): string {
  const rel = path.relative(os.homedir(), p);
  return rel.startsWith("..") ? p : rel;
}

async function askYesNo(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false; // non-interactive: never silently overwrite
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${message} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.book) {
    console.log(USAGE);
    return args.help ? 0 : 1;
  }

  const bookDir = path.resolve(args.book);
  const { book, warnings } = await loadBook(bookDir);
  // Not part of the happy path, but a skipped file has to be visible — silence
  // here is how a mis-named chapter goes missing.
  warnings.forEach((w) => console.warn(`  ⚠ ${w.message}`));

  const prep = await prepareExport(book, bookDir, { out: args.out, newRound: args.newRound });

  ensureRoundStarted(prep);
  const round = currentRound(prep);
  const warn = prep.round ? roundWarning(prep.round) : null;
  if (warn) console.warn(`\n${warn}\n`);

  const totalChapters = book.sections.filter((s) => s.kind === "chapter").length;
  const { buffer, meta } = await renderBlues(book, {
    version: prep.sync.version,
    date: prep.date,
    round: round.round,
    maxRounds: round.maxRounds,
    sourceLabel: path.relative(path.resolve("C:/AI Workspace"), bookDir).replace(/\\/g, "/") || bookDir,
    chapters: args.chapters,
    maxPages: args.pages,
  });

  const result = await finishExport(prep, "blues", buffer, {
    note: args.note ?? (prep.round ? `round ${round.round}` : undefined),
    force: args.yes,
    confirm: askYesNo,
  });

  if (!result.written) {
    console.log("  not regenerated.");
    return 0;
  }

  const range =
    meta.firstChapter === 1 && meta.lastChapter === totalChapters
      ? `chapters 1–${totalChapters}`
      : `chapters ${meta.firstChapter}–${meta.lastChapter} of ${totalChapters}`;

  console.log(`✓ ${book.meta.title} — BLUES v${result.version} (round ${round.round} of ${round.maxRounds})`);
  console.log(`  ${meta.pages} pages · ${range}`);
  console.log(`  → ${displayPath(result.path!)}`);
  for (const name of result.archived) {
    const v = name.match(/_v(\d+)_/)?.[1];
    console.log(`  archived v${v ?? "?"}`);
  }
  return 0;
}

main()
  .then(async (code) => {
    await closeBrowser();
    process.exit(code);
  })
  .catch(async (e) => {
    await closeBrowser().catch(() => {});
    if (isAppError(e)) {
      console.error(`\n  ${e.userMessage}${e.detail ? `\n  ${e.detail}` : ""}\n`);
    } else {
      console.error(`\n  ${e instanceof Error ? e.message : String(e)}\n`);
    }
    process.exit(1);
  });
