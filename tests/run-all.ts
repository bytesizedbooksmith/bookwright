/* Run every suite in tests/ and summarise.
 *
 * These are plain scripts rather than a test framework: they drive real
 * Chromium renders, real Pandoc, and a real Express server, and each one prints
 * what it checked so a failure reads as a sentence rather than a stack trace.
 * The runner just sequences them — they can't share a browser or a port.
 *
 *   npm test              all suites
 *   npm test -- blues     only suites whose name matches
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TSX = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

// Slowest last: the ones that render the whole book take minutes, and a fast
// failure in ingestion should surface before you wait for them.
const ORDER = [
  "ingestion.test.ts",
  "versioning.test.ts",
  "destinations.test.ts",
  "review-folder.test.ts",
  "dropcap.test.ts",
  "web-export.test.ts",
  "acceptance.test.ts",
  "blues-format.test.ts",
  "cli.test.ts",
];

const filter = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const present = (await fs.readdir(HERE)).filter((f) => f.endsWith(".test.ts"));
const unknown = present.filter((f) => !ORDER.includes(f));
if (unknown.length) console.warn(`  ⚠ not in the run order, running last: ${unknown.join(", ")}`);

const suites = [...ORDER.filter((f) => present.includes(f)), ...unknown].filter(
  (f) => filter.length === 0 || filter.some((q) => f.includes(q)),
);

function run(file: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("node", [TSX, path.join(HERE, file)], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code: code ?? 0, out }));
  });
}

let totalPass = 0;
let totalFail = 0;
const failed: string[] = [];

for (const file of suites) {
  const started = Date.now();
  const { code, out } = await run(file);
  const m = out.match(/(\d+) passed, (\d+) failed/);
  const passed = m ? Number(m[1]) : 0;
  const failedN = m ? Number(m[2]) : code === 0 ? 0 : 1;
  totalPass += passed;
  totalFail += failedN;
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  const status = failedN === 0 && code === 0 ? "✓" : "✗";
  console.log(`${status} ${file.replace(".test.ts", "").padEnd(16)} ${String(passed).padStart(3)} passed  ${String(failedN).padStart(2)} failed  ${secs.padStart(3)}s`);
  if (failedN > 0 || code !== 0) {
    failed.push(file);
    // Only the failing lines — the full output is long and mostly ticks.
    out
      .split("\n")
      .filter((l) => l.includes("✗") || /Error|error TS/.test(l))
      .slice(0, 12)
      .forEach((l) => console.log(`      ${l.trim()}`));
  }
}

console.log(`\n${totalPass} passed, ${totalFail} failed across ${suites.length} suites`);
if (failed.length) console.log(`failing: ${failed.join(", ")}`);
process.exit(totalFail === 0 ? 0 : 1);
