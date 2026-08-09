/* Phase 4 verification — version tracking (acceptance tests 8, 10, 11, 13 and
   the hash/adoption rules). Everything runs against throwaway copies; the real
   Bk-1_The-Inn is only ever READ. */
import path from "node:path";
import { promises as fs } from "node:fs";
import { makeBookFixture, type Fixture } from "./fixtures/book.ts";
import { loadBook } from "../server/pipeline/ingest.ts";
import {
  appendLineage,
  bumpRound,
  chaptersOf,
  commitSync,
  countWords,
  hashChapters,
  metaDir,
  priorExport,
  readVersionFile,
  recordExport,
  roundWarning,
  shortHash,
  syncVersion,
  today,
} from "../server/versioning.ts";

const INN = "C:/AI Workspace/Books/Linfield/Series-1_Goose/Bk-1_The-Inn";
let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

/** A disposable copy with metadata pinned to a known state — see fixtures/book.ts. */
const fixtures: Fixture[] = [];
async function scratchInn(opts: Parameters<typeof makeBookFixture>[0] = {}): Promise<string> {
  const f = await makeBookFixture(opts);
  fixtures.push(f);
  return f.bookDir;
}

// ---------------------------------------------------------------- hashing
console.log("\nHashing");
const { book: inn } = await loadBook(INN);
const chapters = chaptersOf(inn);
const h1 = hashChapters(chapters);
const h2 = hashChapters(chapters);
check("stable across calls", h1 === h2);
check("canonical form (sha256 + 64 hex)", /^sha256:[0-9a-f]{64}$/.test(h1), h1.slice(0, 24) + "…");
check("full digest stored, short form for display", shortHash(h1).length === 8, shortHash(h1));

const crlf = chapters.map((s) => ({ ...s, markdown: s.markdown.replace(/\n/g, "\r\n") }));
check("line endings do not change the hash", hashChapters(crlf) === h1);

const edited = chapters.map((s, i) => (i === 3 ? { ...s, markdown: s.markdown.replace("the", "teh") } : s));
check("one changed word DOES change the hash", hashChapters(edited) !== h1);

const retitled = chapters.map((s, i) => (i === 0 ? { ...s, subtitle: "Something Else" } : s));
check("a changed heading changes the hash", hashChapters(retitled) !== h1);
check("word count matches the fixed method", countWords(chapters) === 52294, String(countWords(chapters)));

// ---------------------------------------------------------------- adoption
console.log("\nAdoption of the hand-seeded file (the hash_note case)");
const dirA = await scratchInn();
const before = await readVersionFile(dirA);
console.log(`  stored: v${before!.current_version} hash=${String(before!.current_source_hash).slice(0, 20)}…`);
const s1 = await syncVersion(inn, dirA);
check("8  adopts at the CURRENT version — no spurious v7", s1.version === 6 && s1.adopted, `v${s1.version} adopted=${s1.adopted}`);
check("   does not report the source as changed", !s1.changed);
await commitSync(dirA, s1);
const afterA = await readVersionFile(dirA);
check("   canonical hash written back", /^sha256:[0-9a-f]{64}$/.test(afterA!.current_source_hash));
check("   hash_note cleared once the handover happened", afterA!.hash_note === undefined);
check("   v1-v5 history preserved", afterA!.history.length === 6, `${afterA!.history.length} entries`);
check("   reconstructed flags left intact", afterA!.history[0].reconstructed === true);
check("   max_rounds preserved (1 for this book)", afterA!.max_rounds === 1, String(afterA!.max_rounds));
check("   hand-written word_count_method preserved", typeof afterA!.word_count_method === "string");

// ---------------------------------------------------------------- unchanged
console.log("\nSecond export, source untouched");
const s2 = await syncVersion(inn, dirA);
check("9  same version, no new history entry", s2.version === 6 && !s2.changed && !s2.adopted);
recordExport(s2.entry, "blues", "the-inn_v6_2026-08-08_blues.pdf");
recordExport(s2.entry, "epub", "the-inn_v6_2026-08-08.epub");
await commitSync(dirA, s2);
const afterB = await readVersionFile(dirA);
const v6 = afterB!.history.find((e) => e.version === 6)!;
check("9  both artifacts land under the SAME history entry", v6.exports.length === 2, `${v6.exports.length} exports`);
check("   history did not grow", afterB!.history.length === 6);
check("11 a prior export at this version is detectable", priorExport(v6, "epub") !== null);
check("   an artifact never made is not", priorExport(v6, "docx") === null);

// ---------------------------------------------------------------- changed
console.log("\nOne word changed in one chapter");
const chFile = path.join(dirA, "chapter-07.md");
const orig = await fs.readFile(chFile, "utf8");
await fs.writeFile(chFile, orig.replace("The", "One"), "utf8");
const { book: edited2 } = await loadBook(dirA);
const s3 = await syncVersion(edited2, dirA);
check("10 version increments to 7", s3.version === 7 && s3.changed, `v${s3.version}`);
await commitSync(dirA, s3);
const afterC = await readVersionFile(dirA);
check("10 a new history entry opened", afterC!.history.length === 7);
check("10 the recorded hash changed", afterC!.current_source_hash !== afterA!.current_source_hash);
check("   the v6 entry kept its exports", afterC!.history.find((e) => e.version === 6)!.exports.length === 2);
check("   the new entry starts with none", afterC!.history.find((e) => e.version === 7)!.exports.length === 0);

// ---------------------------------------------------------------- rounds
console.log("\nRounds");
const rf = (await readVersionFile(dirA))!;
const r1 = bumpRound(rf);
check("   first round is 1 of 1", r1.round === 1 && r1.maxRounds === 1 && !r1.overCap);
check("   no warning under the cap", roundWarning(r1) === null);
const r2 = bumpRound(rf);
check("13 going past the cap is flagged, not blocked", r2.round === 2 && r2.overCap);
const warn = roundWarning(r2);
check("13 the warning names the round and the cap", !!warn && warn.includes("ROUND 2 OF 1"), warn?.split("\n")[0]);

// ---------------------------------------------------------------- lineage
console.log("\nLINEAGE.md");
const before2 = await fs.readFile(path.join(metaDir(dirA), "LINEAGE.md"), "utf8");
await appendLineage(dirA, { date: today(), version: 6, artifact: "blues", words: 52294, note: "round 1" });
await appendLineage(dirA, { date: today(), version: 6, artifact: "epub", words: 52294 });
const after2 = await fs.readFile(path.join(metaDir(dirA), "LINEAGE.md"), "utf8");

check("8  the hand-written document survives verbatim", after2.includes("## What the July 21 pass actually did"));
check("   nothing above the marker was rewritten", after2.startsWith(before2.slice(0, before2.indexOf("| Date |"))));
check("   the seeded v6 source row is still there", after2.includes("| 2026-08-08 | v6 | source |"));
check("   both new rows appended", after2.includes("| v6 | blues |") && after2.includes("| v6 | epub |"));
check("   rows stay contiguous with the table (no blank line)", !/\|\s*\n\s*\n\s*\|/.test(after2.slice(after2.indexOf("| Date |"))));
check("   the marker survives for next time", after2.includes("<!-- formatter:insert-rows-above -->"));
const rowsAfterMarker = after2.slice(after2.indexOf("<!-- formatter:insert-rows-above -->")).split("\n").filter((l) => l.startsWith("| 2026"));
check("   new rows sit ABOVE the marker", rowsAfterMarker.length === 0, `${rowsAfterMarker.length} below`);

// ---------------------------------------------------------------- seeding
console.log("\nA book with no _meta yet");
const dirB = await scratchInn({ noMeta: true });
const { book: fresh } = await loadBook(dirB);
const s4 = await syncVersion(fresh, dirB);
check("   seeds at v1", s4.seeded && s4.version === 1);
await commitSync(dirB, s4);
await appendLineage(dirB, { date: today(), version: 1, artifact: "blues", words: s4.words });
const seeded = await readVersionFile(dirB);
check("   version.json written under _meta/", seeded !== null && seeded.current_version === 1);
check("   LINEAGE.md seeded with a usable table", (await fs.readFile(path.join(metaDir(dirB), "LINEAGE.md"), "utf8")).includes("| Date | Ver | Artifact |"));
check("   nothing written to the book root", !(await fs.readdir(dirB)).some((f) => /^(LINEAGE\.md|version\.json)$/i.test(f)));

// The real book must be untouched by any of this. Its hash and round counter
// move as real exports happen, so only the version is asserted — pinning the
// hash here is what made this suite break after the first genuine export.
const innNow = await readVersionFile(INN);
check("\n   the real Bk-1_The-Inn was only read", innNow!.current_version === 6, `v${innNow!.current_version}`);

for (const f of fixtures) await f.cleanup();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
