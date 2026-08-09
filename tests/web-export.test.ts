/* Phase 7 verification — the web UI's server half.
   Drives the real API on an ephemeral port: folder-backed projects get written
   server-side, drag-and-dropped ones still come back as bytes to download. */
import path from "node:path";


import { promises as fs } from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerApi } from "../server/api.ts";
import { closeBrowser } from "../server/pipeline/render-pdf.ts";
import { readVersionFile } from "../server/versioning.ts";
import { makeBookFixture, sourceSnapshot } from "./fixtures/book.ts";
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

// ---- throwaway book + review folder ----
const fixture = await makeBookFixture();
const { bookDir, reviewDir } = fixture;
const SLUG = slugForFolder(bookDir);
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const app = express();
app.use(express.json({ limit: "5mb" }));
registerApi(app);
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

async function post(url: string, body: unknown): Promise<any> {
  const r = await fetch(`${base}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: r.status, body: await r.json() };
}

// ---------------------------------------------------------------- folder project
console.log("\nFolder-backed project (server writes)");
const opened = await post("/api/projects/open-folder", { path: bookDir });
check("opens from a real folder", opened.status === 200 && opened.body.source === "folder", opened.body.source);
const id = opened.body.projectId;

const blues1 = await post(`/api/projects/${id}/export`, { format: "blues", pages: 20, meta: {}, theme: "classic" });
check("blues written server-side", blues1.body.written === true, JSON.stringify(blues1.body.message ?? ""));
check("   no bytes sent to the browser", blues1.body.dataBase64 === undefined);
check("   landed in the review folder", String(blues1.body.path).startsWith(path.resolve(reviewDir)), blues1.body.path);
check(
  "   named per D3",
  new RegExp(`^${esc(SLUG)}_v6_\\d{4}-\\d{2}-\\d{2}_blues\\.pdf$`).test(blues1.body.filename),
  blues1.body.filename,
);
check("   reports version, pages, chapters, round", blues1.body.version === 6 && blues1.body.pages > 0 && blues1.body.round === 1, JSON.stringify({ v: blues1.body.version, p: blues1.body.pages, r: blues1.body.round }));
check("   respected the page cap", blues1.body.pages <= 20, `${blues1.body.pages} pages`);

// ---- the confirm round trip ----
console.log("\nThe confirm round trip");
const blues2 = await post(`/api/projects/${id}/export`, { format: "blues", pages: 20, meta: {}, theme: "classic" });
check("second run asks instead of writing", blues2.body.needsConfirm === true && !blues2.body.written);
check("   the message names the file and version", /source unchanged since v6/.test(blues2.body.message ?? "") && /already exists/.test(blues2.body.message ?? ""), blues2.body.message);
const blues3 = await post(`/api/projects/${id}/export`, { format: "blues", pages: 20, force: true, meta: {}, theme: "classic" });
check("   force writes and reports the overwrite", blues3.body.written === true && blues3.body.overwrote === true);
const reviewFiles = (await fs.readdir(reviewDir)).filter((f) => f.endsWith(".pdf"));
check("   still exactly one file", reviewFiles.length === 1, reviewFiles.join(", "));

// ---- a non-blues artifact goes to _exports ----
console.log("\nNon-blues artifacts stay with the book");
const kdp = await post(`/api/projects/${id}/export`, { format: "epub", preset: "kdp", meta: {}, theme: "classic" });
check("epub written server-side", kdp.body.written === true);
check("   into _exports/", String(kdp.body.path).includes(`${path.sep}_exports${path.sep}`), kdp.body.path);
check(
  "   with the _kdp variant",
  new RegExp(`^${esc(SLUG)}_v6_\\d{4}-\\d{2}-\\d{2}_kdp\\.epub$`).test(kdp.body.filename),
  kdp.body.filename,
);
check("   validation still returned", kdp.body.validation?.tool === "epubcheck" && kdp.body.validation.valid === true, JSON.stringify(kdp.body.validation?.tool));

const vf = (await readVersionFile(bookDir))!;
const entry = vf.history.find((e) => e.version === 6)!;
check("   all UI exports recorded under one entry", entry.exports.length >= 3, `${entry.exports.length} exports`);
check("   version never left v6", vf.current_version === 6);

// ---------------------------------------------------------------- sample project
console.log("\nDrag-and-drop / sample project (download fallback)");
const sample = await post("/api/sample", {});
const sid = sample.body.projectId;
check("sample is not folder-backed", sample.body.source === "sample");
const sampleMd = await post(`/api/projects/${sid}/export`, { format: "md", meta: {}, theme: "classic" });
check("falls back to bytes for download", sampleMd.body.written === false && typeof sampleMd.body.dataBase64 === "string");
check("   nothing written to the repo sample folder", !(await fs.readdir(path.join(process.cwd(), "samples", "clockwork-garden"))).includes("_exports"));
const sampleBlues = await post(`/api/projects/${sid}/export`, { format: "blues", meta: {}, theme: "classic" });
check("blues refused with a useful reason", sampleBlues.status >= 400 && /opened from a folder/.test(sampleBlues.body.error ?? ""), sampleBlues.body.error);

// ---------------------------------------------------------------- safety
check("\n   the source book is unchanged", (await sourceSnapshot()) === sourceBefore);

server.close();
await closeBrowser();
await fixture.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
