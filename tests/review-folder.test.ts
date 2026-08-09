/* Setting the review folder from the application — the gap found by opening a
   book that had never had blues_output set by hand. */
import path from "node:path";
import { promises as fs } from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";
import { makeBookFixture } from "./fixtures/book.ts";
import { registerApi } from "../server/api.ts";
import { closeBrowser } from "../server/pipeline/render-pdf.ts";
import { readConfig } from "../server/matter.ts";
import { resolveDestinations, destinationFor, NoBluesDestinationError } from "../server/destinations.ts";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// A book with NO blues_output set — the state any book starts in.
const fx = await makeBookFixture();
const yamlPath = path.join(fx.bookDir, "book.yaml");
await fs.writeFile(yamlPath, (await fs.readFile(yamlPath, "utf8")).replace(/^blues_output:.*$/m, "").trimEnd() + "\n", "utf8");

const app = express();
app.use(express.json({ limit: "5mb" }));
registerApi(app);
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = async (url: string, body: unknown) => {
  const r = await fetch(`${base}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, body: (await r.json()) as any };
};

console.log("\nA book with no review folder");
const opened = await post("/api/projects/open-folder", { path: fx.bookDir });
const id = opened.body.projectId;
check("the summary reports no destination", opened.body.bluesOutput === null, String(opened.body.bluesOutput));

const dest0 = await resolveDestinations(fx.bookDir);
check("resolveDestinations agrees", dest0.bluesDir === null);
let threw: unknown = null;
try {
  destinationFor("blues", dest0);
} catch (e) {
  threw = e;
}
check("a blues attempt fails with a typed error", threw instanceof NoBluesDestinationError);
check(
  "   the message no longer names a CLI flag",
  !/--out|book\.yaml/.test((threw as Error).message),
  (threw as Error).message,
);
check("   non-blues artifacts are unaffected", destinationFor("epub-universal", dest0).includes("_exports"));

console.log("\nSetting it from the app");
const saved = await post(`/api/projects/${id}/export-settings`, { blues_output: fx.reviewDir });
check("the endpoint returns the updated summary", saved.status === 200 && saved.body.bluesOutput !== null, String(saved.body.bluesOutput));
const cfg = (await readConfig(fx.bookDir))!;
check("written to book.yaml", typeof cfg.blues_output === "string", String(cfg.blues_output));
check("   stored with forward slashes", !String(cfg.blues_output).includes("\\"), String(cfg.blues_output));
check("   the rest of book.yaml survived", typeof cfg.title === "string" && cfg.title.length > 0 && Array.isArray(cfg.frontmatter));
const dest1 = await resolveDestinations(fx.bookDir);
check("   the CLI path sees the same value", dest1.bluesDir === path.resolve(fx.reviewDir));

console.log("\nAnd a blues now writes");
const blues = await post(`/api/projects/${id}/export`, { format: "blues", pages: 12, meta: {}, theme: "classic" });
check("written to the chosen folder", blues.body.written === true && String(blues.body.path).startsWith(path.resolve(fx.reviewDir)), blues.body.path ?? blues.body.error);
check("   the file is really there", (await fs.readdir(fx.reviewDir)).some((f) => f.endsWith(".pdf")));

console.log("\nChanging it");
const other = path.join(fx.root, "Another Review Folder");
await post(`/api/projects/${id}/export-settings`, { blues_output: other });
const dest2 = await resolveDestinations(fx.bookDir);
check("the new folder takes effect", dest2.bluesDir === path.resolve(other));
check("   the old folder is left alone, not moved", (await fs.readdir(fx.reviewDir)).some((f) => f.endsWith(".pdf")));

server.close();
await closeBrowser();
await fx.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
