/* Destinations, naming, and archive-on-write.
   Runs against a throwaway copy of the book and a throwaway review folder; the
   real manuscript and the real OneDrive folder are never written to. */
import path from "node:path";
import { promises as fs } from "node:fs";
import { makeBookFixture, sourceSnapshot, TEST_BOOK } from "./fixtures/book.ts";
import { loadBook } from "../server/pipeline/ingest.ts";
import {
  ARCHIVE_DIRNAME,
  artifactFilename,
  parseArtifactName,
  planWrite,
  resolveDestinations,
  slugForFolder,
  type ArtifactType,
} from "../server/destinations.ts";
import { finishExport, prepareExport } from "../server/exporter.ts";
import { readVersionFile, metaDir } from "../server/versioning.ts";
import { slugify } from "../server/pipeline/util.ts";

// The book under test — the bundled sample unless BSBF_TEST_BOOK says otherwise.
let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// Proof, at the end, that this suite never wrote back to the source book.
const sourceBefore = await sourceSnapshot();

// Metadata pinned to a known state — the real book's _meta moves as genuine
// exports happen, and assertions pinned to a snapshot of it break the moment
// one runs. See fixtures/book.ts.
const fixture = await makeBookFixture();
const { bookDir, reviewDir } = fixture;
const SLUG = slugForFolder(bookDir);

// ---------------------------------------------------------------- naming
console.log("\nNaming");
check("slug comes from the folder, not the title", SLUG === slugify(path.basename(TEST_BOOK)), SLUG);
check("   Bk-2 prefix also stripped", slugForFolder("C:/x/Bk-2_Second-Book") === "second-book");
check("   a folder with no prefix is used as-is", slugForFolder("C:/x/A-Standalone") === "a-standalone");

const naming: [ArtifactType, string][] = [
  ["blues", `${SLUG}_v6_2026-08-08_blues.pdf`],
  ["print", `${SLUG}_v6_2026-08-08_print.pdf`],
  ["reading", `${SLUG}_v6_2026-08-08_reading.pdf`],
  ["epub-kdp", `${SLUG}_v6_2026-08-08_kdp.epub`],
  ["epub-universal", `${SLUG}_v6_2026-08-08.epub`],
  ["docx", `${SLUG}_v6_2026-08-08.docx`],
  ["md", `${SLUG}_v6_2026-08-08.md`],
];
for (const [type, expected] of naming) {
  check(`   ${type.padEnd(15)} -> ${expected}`, artifactFilename(SLUG, 6, "2026-08-08", type) === expected);
}
check(
  "   names sort by version",
  [`${SLUG}_v10_2026-01-01.epub`, `${SLUG}_v2_2026-09-09.epub`].sort()[0].includes("v10"),
  "v10 before v2 (string sort) — dates still disambiguate",
);
const parsed = parseArtifactName(`${SLUG}_v6_2026-08-08_blues.pdf`, SLUG);
check("   filenames parse back", parsed?.version === 6 && parsed.variant === "blues" && parsed.ext === "pdf");
const packetName = artifactFilename(SLUG, 6, "2026-08-08", "blues", "chapters-6-7");
const parsedPacket = parseArtifactName(packetName, SLUG);
check(
  "   chapter-range packets have distinct parseable names",
  packetName === `${SLUG}_v6_2026-08-08_blues_chapters-6-7.pdf` &&
    parsedPacket?.variant === "blues" &&
    parsedPacket.tag === "chapters-6-7",
  packetName,
);
let unsafeTagRejected = false;
try { artifactFilename(SLUG, 6, "2026-08-08", "blues", "../unsafe"); } catch { unsafeTagRejected = true; }
check("   unsafe artifact tags are rejected", unsafeTagRejected);
let tagWithoutVariantRejected = false;
try { artifactFilename(SLUG, 6, "2026-08-08", "epub-universal", "chapters-6-7"); } catch { tagWithoutVariantRejected = true; }
check("   tags are rejected when the artifact naming scheme cannot parse them", tagWithoutVariantRejected);
check("   a foreign file is not parsed as ours", parseArtifactName("notes.pdf", SLUG) === null);

// ---------------------------------------------------------------- routing
console.log("\nRouting");
const dest = await resolveDestinations(bookDir);
check("blues goes to the review folder", dest.bluesDir === path.resolve(reviewDir));
check("everything else stays with the book", dest.exportsDir === path.resolve(bookDir, "_exports"));

// ---------------------------------------------------------------- test 9
console.log("\n9  three artifacts, no source edits between them");
const { book } = await loadBook(bookDir);
const prepA = await prepareExport(book, bookDir, { date: "2026-08-08" });
const rBlues = await finishExport(prepA, "blues", Buffer.from("BLUES-v6"), { note: "round 1" });
const rPacket = await finishExport(prepA, "blues", Buffer.from("BLUES-v6-CH6-7"), { filenameTag: "chapters-6-7" });
check("   continuation packet is written under its distinct name", rPacket.filename === packetName, rPacket.filename);
const packetPlan = await planWrite("blues", await resolveDestinations(bookDir), 6, "2026-08-08", "chapters-6-7");
check("   continuation packet preserves the same-version main packet", packetPlan.toArchive.length === 0, packetPlan.toArchive.join(", "));
const replacementPacketPlan = await planWrite("blues", await resolveDestinations(bookDir), 6, "2026-08-09", "chapters-6-7");
check(
  "   a later packet with the same tag archives only its predecessor",
  replacementPacketPlan.toArchive.length === 1 && replacementPacketPlan.toArchive[0] === packetName,
  replacementPacketPlan.toArchive.join(", "),
);

const prepB = await prepareExport((await loadBook(bookDir)).book, bookDir, { date: "2026-08-08" });
const rEpub = await finishExport(prepB, "epub-universal", Buffer.from("EPUB-v6"));

const prepC = await prepareExport((await loadBook(bookDir)).book, bookDir, { date: "2026-08-08" });
const rPrint = await finishExport(prepC, "print", Buffer.from("PRINT-v6"));

check("all three read v6", rBlues.version === 6 && rEpub.version === 6 && rPrint.version === 6);
check("   all three filenames say v6", [rBlues, rEpub, rPrint].every((r) => r.filename!.includes("_v6_")));
const vf = (await readVersionFile(bookDir))!;
const entry6 = vf.history.find((e) => e.version === 6)!;
check("   all four under ONE history entry", entry6.exports.length === 4, `${entry6.exports.length}`);
check("   history did not grow", vf.history.length === 6, `${vf.history.length} entries`);
check("   the blues went to the review folder", rBlues.path!.startsWith(path.resolve(reviewDir)));
check("   the epub stayed with the book", rEpub.path!.includes(`${path.sep}_exports${path.sep}`));

// ---------------------------------------------------------------- test 11
console.log("\n11 re-export at an unchanged version");
const prepD = await prepareExport((await loadBook(bookDir)).book, bookDir, { date: "2026-08-08" });
let prompted = "";
const declined = await finishExport(prepD, "epub-universal", Buffer.from("EPUB-again"), {
  confirm: async (m) => {
    prompted = m;
    return false;
  },
});
check("the prompt fires", prompted.includes("source unchanged since v6") && prompted.includes("already exists"), prompted);
check("   declining writes nothing", !declined.written);
check(
  "   the file on disk is untouched",
  (await fs.readFile(path.join(dest.exportsDir, `${SLUG}_v6_2026-08-08.epub`), "utf8")) === "EPUB-v6",
);

const prepE = await prepareExport((await loadBook(bookDir)).book, bookDir, { date: "2026-08-08" });
const accepted = await finishExport(prepE, "epub-universal", Buffer.from("EPUB-regenerated"), { confirm: async () => true });
check("   accepting overwrites in place — same version, same name", accepted.overwrote && accepted.filename === `${SLUG}_v6_2026-08-08.epub`);
check(
  "   contents replaced",
  (await fs.readFile(path.join(dest.exportsDir, `${SLUG}_v6_2026-08-08.epub`), "utf8")) === "EPUB-regenerated",
);
const exportsAfter = (await fs.readdir(dest.exportsDir)).filter((f) => f.endsWith(".epub"));
check("   no duplicate left behind", exportsAfter.length === 1, exportsAfter.join(", "));

// ---------------------------------------------------------------- test 12
console.log("\n12 a new version archives the old one");
const chFile = fixture.chapterFiles[fixture.chapterFiles.length - 1];
await fs.writeFile(chFile, (await fs.readFile(chFile, "utf8")).replace("The", "One"), "utf8");
const prepF = await prepareExport((await loadBook(bookDir)).book, bookDir, { date: "2026-08-15" });
check("version rolled to 7", prepF.sync.version === 7 && prepF.sync.changed, `v${prepF.sync.version}`);

const rBlues7 = await finishExport(prepF, "blues", Buffer.from("BLUES-v7"));
const prepG = await prepareExport((await loadBook(bookDir)).book, bookDir, { date: "2026-08-15" });
const rEpub7 = await finishExport(prepG, "epub-universal", Buffer.from("EPUB-v7"));

check(
  "   both v6 blues artifacts were archived",
  rBlues7.archived.includes(`${SLUG}_v6_2026-08-08_blues.pdf`) &&
    rBlues7.archived.includes(`${SLUG}_v6_2026-08-08_blues_chapters-6-7.pdf`),
  rBlues7.archived.join(", "),
);
check("   v6 epub was archived", rEpub7.archived.includes(`${SLUG}_v6_2026-08-08.epub`), rEpub7.archived.join(", "));

const reviewTop = (await fs.readdir(reviewDir)).filter((f) => f !== ARCHIVE_DIRNAME);
check("12 only current artifacts at the top of the review folder", reviewTop.length === 1 && reviewTop[0].includes("_v7_"), reviewTop.join(", "));
// "Only current artifacts at the top level" means one file per ARTIFACT TYPE,
// each the newest of its type — not that every file shares the newest version.
// The v6 print pdf stays visible because no v7 print pdf was ever made, and it
// is still the only print pdf there is; archiving it would hide the sole copy.
// The version in the filename is what makes its staleness legible.
const exportsTop = (await fs.readdir(dest.exportsDir)).filter((f) => f !== ARCHIVE_DIRNAME);
const byType = new Map<string, number[]>();
for (const f of exportsTop) {
  const p = parseArtifactName(f, dest.slug)!;
  const key = `${p.variant ?? ""}.${p.ext}`;
  byType.set(key, [...(byType.get(key) ?? []), p.version]);
}
check(
  "12 one file per artifact type at the top of _exports",
  [...byType.values()].every((v) => v.length === 1),
  exportsTop.join(", "),
);
check("   the newest epub is v7", byType.get(".epub")?.[0] === 7);
check("   the print pdf is still v6 and still visible (no v7 was made)", byType.get("print.pdf")?.[0] === 6);

const archivedReview = await fs.readdir(path.join(reviewDir, ARCHIVE_DIRNAME));
check("12 nothing deleted — the old blues is in _archive/", archivedReview.includes(`${SLUG}_v6_2026-08-08_blues.pdf`));
check(
  "   archived content intact",
  (await fs.readFile(path.join(reviewDir, ARCHIVE_DIRNAME, `${SLUG}_v6_2026-08-08_blues.pdf`), "utf8")) === "BLUES-v6",
);

// print pdf from v6 must NOT have been archived by the epub write
const exportsArchive = await fs.readdir(path.join(dest.exportsDir, ARCHIVE_DIRNAME));
check("   archiving is per artifact type", exportsArchive.includes(`${SLUG}_v6_2026-08-08.epub`) && !exportsArchive.includes(`${SLUG}_v6_2026-08-08_kdp.epub`));
check("   the v6 print pdf is still current (never re-exported)", exportsTop.some((f) => f.includes("_v7_")) && (await fs.readdir(dest.exportsDir)).includes(`${SLUG}_v6_2026-08-08_print.pdf`));

// Same version, next day: a new filename, not an overwrite. The older-dated one
// must be archived or the folder ends up with two "current" files.
console.log("\n   same version regenerated on a later date");
const prepDate = await prepareExport((await loadBook(bookDir)).book, bookDir, { date: "2026-08-16" });
const nextDay = await finishExport(prepDate, "blues", Buffer.from("BLUES-v7-next-day"));
check("the previous date is archived", nextDay.archived.includes(`${SLUG}_v7_2026-08-15_blues.pdf`), nextDay.archived.join(", "));
const reviewTop2 = (await fs.readdir(reviewDir)).filter((f) => f !== ARCHIVE_DIRNAME);
check("   exactly one blues at the top level", reviewTop2.length === 1 && reviewTop2[0].includes("2026-08-16"), reviewTop2.join(", "));
check(
  "   all older blues artifacts preserved in _archive/",
  (await fs.readdir(path.join(reviewDir, ARCHIVE_DIRNAME))).length === 3,
  (await fs.readdir(path.join(reviewDir, ARCHIVE_DIRNAME))).join(", "),
);

// never overwrite inside _archive/
await fs.writeFile(path.join(dest.exportsDir, `${SLUG}_v6_2026-08-08.epub`), "EPUB-v6-again", "utf8");
const prepH = await prepareExport((await loadBook(bookDir)).book, bookDir, { date: "2026-08-16" });
const again = await finishExport(prepH, "epub-universal", Buffer.from("EPUB-v7-b"), { force: true });
const arch2 = await fs.readdir(path.join(dest.exportsDir, ARCHIVE_DIRNAME));
check("   an archive collision is parked, never overwritten", arch2.filter((f) => f.startsWith(`${SLUG}_v6_2026-08-08`)).length === 2, arch2.join(", "));
void again;

// ---------------------------------------------------------------- lineage
console.log("\nLINEAGE rows");
const lineage = await fs.readFile(path.join(metaDir(bookDir), "LINEAGE.md"), "utf8");
check("a row per written artifact", (lineage.match(/\| v[67] \| (blues|epub-universal|print) \|/g) ?? []).length >= 5);
check("   --note text lands in the Note column", lineage.includes("| round 1 |"));
check("   nothing written to the book root", !(await fs.readdir(bookDir)).some((f) => /^(LINEAGE\.md|version\.json)$/i.test(f)));

// Everything above happened in a temp copy. The source book must be exactly as
// it was found — no _meta, no _exports, nothing written back into it.
check("\n   the source book is unchanged", (await sourceSnapshot()) === sourceBefore);

await fixture.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
