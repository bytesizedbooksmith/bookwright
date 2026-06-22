import path from "node:path";
import { promises as fs } from "node:fs";
import yauzl from "yauzl";
import { commandExists, run } from "../pipeline/exec.ts";
import { VENDOR_DIR, makeTempDir } from "../pipeline/paths.ts";

export interface ValidationMessage {
  severity: "error" | "warning" | "info";
  text: string;
}

export interface ValidationReport {
  tool: "epubcheck" | "builtin";
  valid: boolean;
  messages: ValidationMessage[];
  note?: string;
}

/** Read selected text entries from an EPUB buffer (in memory). */
function readEntries(buffer: Buffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const result = new Map<string, string>();
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err);
      zip.on("entry", (entry) => {
        if (!wanted(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return zip.readEntry();
          const chunks: Buffer[] = [];
          stream.on("data", (c) => chunks.push(c));
          stream.on("end", () => {
            result.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(result));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

/** Lightweight structural checks used when EPUBCheck (Java) is unavailable. */
async function builtinCheck(buffer: Buffer): Promise<ValidationReport> {
  const messages: ValidationMessage[] = [];
  const files = await readEntries(
    buffer,
    (n) => n === "mimetype" || n === "META-INF/container.xml" || n.endsWith(".opf") || n.endsWith(".ncx") || n.endsWith("nav.xhtml"),
  );

  const mimetype = files.get("mimetype");
  if (mimetype === undefined) messages.push({ severity: "error", text: "Missing mimetype file." });
  else if (mimetype.trim() !== "application/epub+zip")
    messages.push({ severity: "error", text: `mimetype must be "application/epub+zip" (found "${mimetype.trim()}").` });

  if (!files.has("META-INF/container.xml"))
    messages.push({ severity: "error", text: "Missing META-INF/container.xml." });

  const opfName = [...files.keys()].find((n) => n.endsWith(".opf"));
  if (!opfName) {
    messages.push({ severity: "error", text: "Missing OPF package document." });
  } else {
    const opf = files.get(opfName)!;
    if (!/<dc:title[ >]/.test(opf)) messages.push({ severity: "error", text: "OPF is missing <dc:title>." });
    if (!/<dc:language[ >]/.test(opf)) messages.push({ severity: "error", text: "OPF is missing <dc:language>." });
    if (!/<dc:identifier[ >]/.test(opf)) messages.push({ severity: "error", text: "OPF is missing <dc:identifier>." });
    if (!/properties="cover-image"/.test(opf) && !/name="cover"/.test(opf))
      messages.push({ severity: "warning", text: "No cover image declared in the OPF." });
  }

  const hasNcx = [...files.keys()].some((n) => n.endsWith(".ncx"));
  const hasNav = [...files.keys()].some((n) => n.endsWith("nav.xhtml"));
  if (!hasNav) messages.push({ severity: "warning", text: "No EPUB 3 navigation document (nav.xhtml) found." });
  if (!hasNcx)
    messages.push({ severity: "info", text: "No NCX found. EPUB 3 readers use nav.xhtml; older devices prefer NCX." });

  const hasError = messages.some((m) => m.severity === "error");
  return {
    tool: "builtin",
    valid: !hasError,
    messages,
    note: "Structural check only. Install Java to enable full EPUBCheck validation for retailer-grade results.",
  };
}

async function findEpubcheckJar(): Promise<string | null> {
  const candidates = [
    path.join(VENDOR_DIR, "epubcheck", "epubcheck.jar"),
    path.join(VENDOR_DIR, "epubcheck.jar"),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/** Validate an EPUB buffer with EPUBCheck if available, else built-in checks. */
export async function validateEpub(buffer: Buffer): Promise<ValidationReport> {
  const jar = await findEpubcheckJar();
  const hasJava = jar ? await commandExists("java") : false;

  if (!jar || !hasJava) {
    return builtinCheck(buffer);
  }

  const dir = await makeTempDir("epubcheck-");
  const file = path.join(dir, "book.epub");
  const jsonOut = path.join(dir, "report.json");
  try {
    await fs.writeFile(file, buffer);
    await run("java", ["-jar", jar, file, "--json", jsonOut, "--quiet"]);
    const report = JSON.parse(await fs.readFile(jsonOut, "utf8"));
    const messages: ValidationMessage[] = (report.messages ?? []).map((m: any) => ({
      severity: m.severity === "ERROR" || m.severity === "FATAL" ? "error" : m.severity === "WARNING" ? "warning" : "info",
      text: `${m.ID ?? ""} ${m.message ?? ""}`.trim(),
    }));
    return {
      tool: "epubcheck",
      valid: !messages.some((m) => m.severity === "error"),
      messages,
    };
  } catch (e) {
    const fallback = await builtinCheck(buffer);
    fallback.messages.unshift({ severity: "info", text: `EPUBCheck failed to run (${String(e)}); used built-in checks.` });
    return fallback;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
