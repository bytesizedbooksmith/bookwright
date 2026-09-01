/* Phase 4 verification — version tracking (acceptance tests 8, 10, 11, 13 and
   the hash/adoption rules). Everything runs against throwaway copies; the real
   the source book is only ever READ. */
import path from "node:path";
import { promises as fs } from "node:fs";
import { makeBookFixture, sourceSnapshot, type Fixture } from "./fixtures/book.ts";
import { loadBook } from "../server/pipeline/ingest.ts";
import { slugForFolder } from "../server/destinations.ts";
import {
  appendLineage,
  bumpRound,
  chaptersOf,
  commitSync,
  countWords,
  hashChapters,
  hashBookSource,
  metaDir,
  priorExport,
  readVersionFile,
  recordExport,
  roundWarning,
  shortHash,
  syncVersion,
  today,
} from "../server/versioning.ts";

// The book under test — the bundled sample unless BSBF_TEST_BOOK says otherwise.
let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// Proof, at the end, that this suite never wrote back to the source book.
const sourceBefore = await sourceSnapshot();

/** Disposable copies with metadata pinned to a known state — see fixtures/book.ts. */
const fixtures: Fixture[] = [];
async function scratchBook(opts: Parameters<typeof makeBookFixture>[0] = {}): Promise<Fixture> {
  const f = await makeBookFixture(opts);
  fixtures.push(f);
  return f;
}

const seed = await scratchBook();
const SLUG = slugForFolder(seed.bookDir);
const facts = seed.facts;

// ---------------------------------------------------------------- hashing
console.log("\nHashing");
const { book: inn } = await loadBook(seed.bookDir);
const chapters = chaptersOf(inn);
const h1 = hashChapters(chapters);
const h2 = hashChapters(chapters);
check("stable across calls", h1 === h2);
check("canonical form (sha256 + 64 hex)", /^sha256:[0-9a-f]{64}$/.test(h1), h1.slice(0, 24) + "…");
check("full digest stored, short form for display", shortHash(h1).length === 8, shortHash(h1));

const crlf = chapters.map((s) => ({ ...s, markdown: s.markdown.replace(/\n/g, "\r\n") }));
check("line endings do not change the hash", hashChapters(crlf) === h1);

// The LAST chapter, so this works on a three-chapter sample as well as a novel.
const last = chapters.length - 1;
const edited = chapters.map((s, i) => (i === last ? { ...s, markdown: s.markdown.replace("the", "teh") } : s));
check("one changed word DOES change the hash", hashChapters(edited) !== h1);

const retitled = chapters.map((s, i) => (i === 0 ? { ...s, subtitle: "Something Else" } : s));
check("a changed heading changes the hash", hashChapters(retitled) !== h1);
check("word count matches the fixture", countWords(chapters) === facts.words, String(countWords(chapters)));
const publicationHash = await hashBookSource(inn);
check("publication-source hash is canonical", /^sha256:[0-9a-f]{64}$/.test(publicationHash));
check("front matter changes the publication hash", await hashBookSource({ ...inn, sections: inn.sections.map((section, index) => index === 0 ? { ...section, markdown: `${section.markdown}\nChanged.` } : section) }) !== publicationHash);
check("section IDs change the publication hash", await hashBookSource({ ...inn, sections: inn.sections.map((section, index) => index === 0 ? { ...section, id: `${section.id}-changed` } : section) }) !== publicationHash);
check("metadata changes the publication hash", await hashBookSource({ ...inn, meta: { ...inn.meta, description: "A changed description" } }) !== publicationHash);
check("typography changes the publication hash", await hashBookSource({ ...inn, typography: { ...inn.typography, fontSize: "13pt" } }) !== publicationHash);
check("style changes the publication hash", await hashBookSource({ ...inn, styles: { ...inn.styles, journal: { color: "#123456" } } }) !== publicationHash);

const assetsA = path.join(seed.root, "hash-assets-a");
const assetsB = path.join(seed.root, "hash-assets-b");
await fs.mkdir(assetsA, { recursive: true });
await fs.mkdir(assetsB, { recursive: true });
const coverA = path.join(assetsA, "cover.png");
const coverB = path.join(assetsB, "cover.png");
const fontA = path.join(assetsA, "body.ttf");
const fontB = path.join(assetsB, "body.ttf");
await Promise.all([
  fs.writeFile(coverA, "same cover bytes"),
  fs.writeFile(coverB, "same cover bytes"),
  fs.writeFile(fontA, "same font bytes"),
  fs.writeFile(fontB, "same font bytes"),
]);
const withAssetsA = {
  ...inn,
  coverPath: coverA,
  fonts: [{ family: "Hash Test Serif", file: fontA }],
};
const withAssetsB = {
  ...inn,
  coverPath: coverB,
  fonts: [{ family: "Hash Test Serif", file: fontB }],
};
const assetsHash = await hashBookSource(withAssetsA);
check("absolute asset paths do not change the publication hash", await hashBookSource(withAssetsB) === assetsHash);
await fs.writeFile(coverB, "changed cover bytes");
check("cover bytes change the publication hash", await hashBookSource(withAssetsB) !== assetsHash);
await fs.writeFile(coverB, "same cover bytes");
await fs.writeFile(fontB, "changed font bytes");
check("font bytes change the publication hash", await hashBookSource(withAssetsB) !== assetsHash);

// ---------------------------------------------------------------- adoption
console.log("\nAdoption of the hand-seeded file (the hash_note case)");
const dirA = seed.bookDir;
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
check("   max_rounds preserved", afterA!.max_rounds === 1, String(afterA!.max_rounds));
check("   hand-written word_count_method preserved", typeof afterA!.word_count_method === "string");

// ---------------------------------------------------------------- unchanged
console.log("\nSecond export, source untouched");
const s2 = await syncVersion(inn, dirA);
check("9  same version, no new history entry", s2.version === 6 && !s2.changed && !s2.adopted);
recordExport(s2.entry, "blues", `${SLUG}_v6_2026-08-08_blues.pdf`);
recordExport(s2.entry, "epub", `${SLUG}_v6_2026-08-08.epub`);
await commitSync(dirA, s2);
const afterB = await readVersionFile(dirA);
const v6 = afterB!.history.find((e) => e.version === 6)!;
check("9  both artifacts land under the SAME history entry", v6.exports.length === 2, `${v6.exports.length} exports`);
check("   history did not grow", afterB!.history.length === 6);
check("11 a prior export at this version is detectable", priorExport(v6, "epub") !== null);
check("   an artifact never made is not", priorExport(v6, "docx") === null);

// ---------------------------------------------------------------- changed
console.log("\nOne word changed in one chapter");
const chFile = seed.chapterFiles[seed.chapterFiles.length - 1];
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
await appendLineage(dirA, { date: today(), version: 6, artifact: "blues", words: facts.words, note: "round 1" });
await appendLineage(dirA, { date: today(), version: 6, artifact: "epub", words: facts.words });
const after2 = await fs.readFile(path.join(metaDir(dirA), "LINEAGE.md"), "utf8");

check("8  hand-written sections survive verbatim", after2.includes("Append-only") && after2.length > before2.length);
check("   nothing above the marker was rewritten", after2.startsWith(before2.slice(0, before2.indexOf("| Date |"))));
check("   the seeded v6 source row is still there", after2.includes("| 2026-08-08 | v6 | source |"));
check("   both new rows appended", after2.includes("| v6 | blues |") && after2.includes("| v6 | epub |"));
check("   rows stay contiguous with the table (no blank line)", !/\|\s*\n\s*\n\s*\|/.test(after2.slice(after2.indexOf("| Date |"))));
check("   the marker survives for next time", after2.includes("<!-- formatter:insert-rows-above -->"));
const rowsAfterMarker = after2.slice(after2.indexOf("<!-- formatter:insert-rows-above -->")).split("\n").filter((l) => l.startsWith("| 2026"));
check("   new rows sit ABOVE the marker", rowsAfterMarker.length === 0, `${rowsAfterMarker.length} below`);

// ---------------------------------------------------------------- seeding
console.log("\nA book with no _meta yet");
const dirB = (await scratchBook({ noMeta: true })).bookDir;
const { book: fresh } = await loadBook(dirB);
const s4 = await syncVersion(fresh, dirB);
check("   seeds at v1", s4.seeded && s4.version === 1);
await commitSync(dirB, s4);
await appendLineage(dirB, { date: today(), version: 1, artifact: "blues", words: s4.words });
const seeded = await readVersionFile(dirB);
check("   version.json written under _meta/", seeded !== null && seeded.current_version === 1);
check("   LINEAGE.md seeded with a usable table", (await fs.readFile(path.join(metaDir(dirB), "LINEAGE.md"), "utf8")).includes("| Date | Ver | Artifact |"));
check("   nothing written to the book root", !(await fs.readdir(dirB)).some((f) => /^(LINEAGE\.md|version\.json)$/i.test(f)));

// Everything above ran on temp copies. The source book must be untouched — no
// metadata written back into whatever manuscript folder is under test.
check("\n   the source book is unchanged", (await sourceSnapshot()) === sourceBefore);

for (const f of fixtures) await f.cleanup();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
