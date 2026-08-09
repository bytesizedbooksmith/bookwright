/* Phase 6 verification — the CLI, run as a real subprocess (acceptance 1, 6, 13).
   Everything targets a throwaway copy of the book and a throwaway review folder. */
import path from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { makeBookFixture, sourceSnapshot } from "./fixtures/book.ts";
import { readVersionFile, metaDir } from "../server/versioning.ts";
import { ROOT } from "../server/pipeline/paths.ts";
import { slugForFolder } from "../server/destinations.ts";

// The book under test — the bundled sample unless BSBF_TEST_BOOK says otherwise.
let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// Proof, at the end, that this suite never wrote back to the source book.
const sourceBefore = await sourceSnapshot();

function runCli(args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("node", [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), path.join(ROOT, "server", "cli-blues.ts"), ...args], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code: code ?? 0, out }));
  });
}

// Pinned metadata — see fixtures/book.ts. blues_round starts at 0 so the round
// assertions below describe the CLI's behaviour rather than whatever state the
// real manuscript happens to be in.
const fixture = await makeBookFixture({ bluesRound: 0 });
const { bookDir, reviewDir } = fixture;
const SLUG = slugForFolder(bookDir);
const CH = fixture.facts.chapters;
/** Escape a book's title/slug so it can go inside a RegExp. */
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------- usage
console.log("\nArgument handling");
const noBook = await runCli([]);
check("no --book prints usage and exits non-zero", noBook.code === 1 && noBook.out.includes("--book <path>"));
const badRange = await runCli(["--book", bookDir, "--chapters", "9-2"]);
check("a backwards range is rejected", badRange.code === 1 && /runs backwards/.test(badRange.out), badRange.out.trim().split("\n").pop());
const badFlag = await runCli(["--book", bookDir, "--nope"]);
check("an unknown flag is rejected", badFlag.code === 1 && /Unknown option/.test(badFlag.out));

// ---------------------------------------------------------------- test 1 + 6
console.log("\n1/6  npm run blues -- --book <inn> --pages 50 --new-round");
const r1 = await runCli(["--book", bookDir, "--pages", "50", "--new-round", "--yes"]);
console.log(
  r1.out
    .trimEnd()
    .split("\n")
    .map((l) => `      ${l}`)
    .join("\n"),
);
check("exits clean", r1.code === 0, `code ${r1.code}`);

const reviewFiles = (await fs.readdir(reviewDir)).filter((f) => f.endsWith(".pdf"));
check("1  a PDF landed in the review folder", reviewFiles.length === 1, reviewFiles.join(", "));
check(
  "1  named per D3",
  new RegExp(`^${esc(SLUG)}_v6_\\d{4}-\\d{2}-\\d{2}_blues\\.pdf$`).test(reviewFiles[0]),
  reviewFiles[0],
);

const lines = r1.out.trim().split("\n").filter((l) => l.trim());
check(
  "   line 1: title, version, round",
  new RegExp(`^✓ ${esc(fixture.facts.title)} — BLUES v6 \\(round 1 of 1\\)$`).test(lines[0]),
  lines[0],
);
// "chapters 1–N of TOTAL" when the cap trimmed the book; plain "chapters 1–N"
// when the whole thing fits. A short sample takes the second form, a novel the
// first, so both are accepted.
check(
  "   line 2: pages and chapter range",
  new RegExp(`^\\s+\\d+ pages · chapters 1–\\d+( of ${CH})?$`).test(lines[1]),
  lines[1],
);
check("   line 3: the destination path", /^\s+→ .*Books to Review.*_blues\.pdf$/.test(lines[2]), lines[2]);
check("   nothing else on the happy path", lines.length === 3, `${lines.length} lines`);
check("6  stopped under the cap", Number(lines[1].match(/(\d+) pages/)![1]) <= 50);

const vf1 = (await readVersionFile(bookDir))!;
check("   version adopted at v6, not bumped to v7", vf1.current_version === 6, `v${vf1.current_version}`);
check("   round recorded as 1", vf1.blues_round === 1, String(vf1.blues_round));
check("   the export is recorded", vf1.history.find((e) => e.version === 6)!.exports.some((e) => e.type === "blues"));
const lin = await fs.readFile(path.join(metaDir(bookDir), "LINEAGE.md"), "utf8");
check("   a LINEAGE row was appended", /\| v6 \| blues \|/.test(lin));
check("   the note defaults to the round", /\| v6 \| blues \|[^|]*\|\s*round 1\s*\|/.test(lin));

// ---------------------------------------------------------------- rerun
console.log("\n11 re-run with no source change");
const r2 = await runCli(["--book", bookDir, "--pages", "50"]);
check("declines without a TTY rather than overwriting silently", r2.out.includes("not regenerated"), r2.out.trim());
const r3 = await runCli(["--book", bookDir, "--pages", "50", "--yes"]);
check("--yes regenerates", r3.code === 0 && r3.out.includes("BLUES v6"));
const vf3 = (await readVersionFile(bookDir))!;
check("   round did NOT advance on a plain re-run", vf3.blues_round === 1, String(vf3.blues_round));
check("   still one file at the top level", (await fs.readdir(reviewDir)).filter((f) => f.endsWith(".pdf")).length === 1);

// ---------------------------------------------------------------- chapters
console.log("\n--chapters and --note");
const r4 = await runCli(["--book", bookDir, "--chapters", `2-${CH}`, "--note", "spot check", "--yes"]);
// The range may itself be trimmed by the page cap, so only the start is pinned.
check(
  "renders a chapter range",
  new RegExp(`chapters 2–\\d+ of ${CH}`).test(r4.out),
  r4.out.trim().split("\n")[1],
);
const lin2 = await fs.readFile(path.join(metaDir(bookDir), "LINEAGE.md"), "utf8");
check("--note lands in the Note column", /\|\s*spot check\s*\|/.test(lin2));

// ---------------------------------------------------------------- test 13
console.log("\n13 round past the cap");
const r5 = await runCli(["--book", bookDir, "--pages", "30", "--new-round", "--yes"]);
check("warns loudly", /ROUND 2 OF 1/.test(r5.out), r5.out.split("\n").find((l) => l.includes("ROUND")) ?? "");
check("   and proceeds anyway", r5.code === 0 && /BLUES v6 \(round 2 of 1\)/.test(r5.out));

// ---------------------------------------------------------------- archiving
console.log("\n12 a source edit archives the old blues");
const ch = fixture.chapterFiles[fixture.chapterFiles.length - 1];
await fs.writeFile(ch, (await fs.readFile(ch, "utf8")).replace("The", "One"), "utf8");
const r6 = await runCli(["--book", bookDir, "--pages", "30", "--yes"]);
check("version rolled to v7", /BLUES v7/.test(r6.out), r6.out.trim().split("\n")[0]);
check("   the console reports the archive", /archived v6/.test(r6.out), r6.out.trim().split("\n").pop());
const top = (await fs.readdir(reviewDir)).filter((f) => f.endsWith(".pdf"));
check("   only the current blues at the top level", top.length === 1 && top[0].includes("_v7_"), top.join(", "));
const arch = await fs.readdir(path.join(reviewDir, "_archive"));
check("   the v6 blues is in _archive/, not deleted", arch.some((f) => f.includes("_v6_")), arch.join(", "));

// ---------------------------------------------------------------- safety
// Everything above ran against a temp copy. A real book under BSBF_TEST_BOOK
// legitimately HAS a _meta folder, so the invariant is not "no metadata" — it
// is that nothing about the source changed.
check("\n   the source book is unchanged", (await sourceSnapshot()) === sourceBefore);

await fixture.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
