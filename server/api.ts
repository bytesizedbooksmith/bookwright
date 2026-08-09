import type { Express, Request, Response } from "express";
import multer from "multer";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BookMeta, PresetName } from "./pipeline/types.ts";
import {
  createProjectFromFiles,
  createProjectFromFolderPath,
  createSampleProject,
  hasProject,
  loadProject,
  projectInfo,
  setProjectCover,
  writableBookDir,
} from "./projects.ts";
import { themeList } from "./pipeline/themes.ts";
import { PRESETS } from "./presets.ts";
import { renderHtml } from "./pipeline/render-html.ts";
import { renderEpub } from "./pipeline/render-epub.ts";
import { renderDocx } from "./pipeline/render-docx.ts";
import { renderMarkdown } from "./pipeline/render-markdown.ts";
import { renderPdf } from "./pipeline/render-pdf.ts";
import { validateEpub } from "./validate/epubcheck.ts";
import { slugify } from "./pipeline/util.ts";
import { pickFolder } from "./pick-folder.ts";
import { renderPrintPdf, renderPrintPreviewHtml } from "./pipeline/render-print.ts";
import { TRIMS, LAYOUTS, DEFAULT_PRINT, type PrintOptions } from "./print.ts";
import {
  MATTER_TYPES,
  addMatter,
  readConfig,
  removeMatter,
  reorderMatter,
  saveMeta,
  saveTypography,
  scaffold,
  type Placement,
} from "./matter.ts";
import { isAppError } from "./errors.ts";
import { checkPandoc } from "./preflight.ts";
import { renderBlues } from "./pipeline/render-blues.ts";
import { currentRound, ensureRoundStarted, finishExport, prepareExport } from "./exporter.ts";
import { roundWarning } from "./versioning.ts";
import type { ArtifactType } from "./destinations.ts";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 800 },
});

/** Build the full project summary the UI works from (loads fresh from disk). */
async function buildSummary(projectId: string, overrides?: Partial<BookMeta>) {
  const { book, warnings } = await loadProject(projectId, overrides);
  const info = projectInfo(projectId);
  let config: { frontmatter: string[]; backmatter: string[]; chapters: string | null } | null = null;
  if (info.folder) {
    const cfg = await readConfig(info.folder);
    if (cfg) {
      config = {
        frontmatter: cfg.frontmatter ?? [],
        backmatter: cfg.backmatter ?? [],
        chapters: (cfg.chapters as string) ?? null,
      };
    }
  }
  const bodyChars = book.sections
    .filter((s) => s.kind === "chapter" || s.kind === "backmatter")
    .reduce((n, s) => n + s.markdown.length, 0);
  return {
    projectId,
    meta: book.meta,
    sections: book.sections.map((s) => ({ id: s.id, title: s.title, kind: s.kind, toc: s.toc })),
    warnings: warnings.map((w) => w.message),
    hasCover: Boolean(book.coverPath),
    bodyChars,
    fontFamilies: book.fonts.map((f) => f.family),
    typography: book.typography ?? {},
    source: info.source,
    folder: info.folder,
    editable: info.editable,
    config,
  };
}

async function wrap(res: Response, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    if (isAppError(e)) {
      console.error(`[${e.code}] ${e.userMessage}${e.detail ? `\n${e.detail}` : ""}`);
      res.status(e.status).json({ error: e.userMessage, code: e.code, detail: e.detail });
      return;
    }
    console.error(e);
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
}

function bodyMeta(req: Request): Partial<BookMeta> {
  const overrides = (req.body?.meta ?? {}) as Partial<BookMeta>;
  if (req.body?.theme) overrides.theme = req.body.theme;
  return overrides;
}

/** Merge UI typography overrides onto the loaded book before rendering. */
function applyTypography(book: { typography: any }, req: Request): void {
  const ty = req.body?.typography;
  if (!ty || typeof ty !== "object") return;
  const cur = book.typography ?? {};
  book.typography = {
    ...cur,
    ...ty,
    chapterTitle: { ...(cur.chapterTitle ?? {}), ...(ty.chapterTitle ?? {}) },
  };
}

export function registerApi(app: Express): void {
  app.get("/api/health", (_req, res) =>
    wrap(res, async () => {
      res.json({ ok: true, name: "byte-sized-book-formatter", version: "1.1.0", pandoc: await checkPandoc() });
    }),
  );
  app.get("/api/themes", (_req, res) => res.json(themeList()));
  app.get("/api/presets", (_req, res) => res.json(Object.values(PRESETS)));
  app.get("/api/matter-types", (_req, res) => res.json(MATTER_TYPES));
  app.get("/api/trims", (_req, res) => res.json(TRIMS));
  app.get("/api/print-layouts", (_req, res) => res.json(LAYOUTS));

  app.post("/api/sample", (_req, res) =>
    wrap(res, async () => {
      res.json(await buildSummary(createSampleProject()));
    }),
  );

  app.post("/api/projects", upload.array("files"), (req: Request, res: Response) =>
    wrap(res, async () => {
      const files = (req.files as Express.Multer.File[]) ?? [];
      let relPaths: string[] = [];
      try {
        relPaths = JSON.parse(req.body?.relPaths ?? "[]");
      } catch {
        /* fall back to basenames */
      }
      const id = await createProjectFromFiles(
        files.map((f, i) => ({ relPath: relPaths[i] || f.originalname, buffer: f.buffer })),
      );
      res.json(await buildSummary(id));
    }),
  );

  // Pop a native folder picker on the user's machine; returns the chosen path.
  app.post("/api/pick-folder", (req: Request, res: Response) =>
    wrap(res, async () => {
      const initial = typeof req.body?.initial === "string" ? req.body.initial : undefined;
      res.json({ path: await pickFolder(initial) });
    }),
  );

  // Open a real folder on disk by path (no copy — edits flow straight through).
  app.post("/api/projects/open-folder", (req: Request, res: Response) =>
    wrap(res, async () => {
      const folder = String(req.body?.path ?? "").trim();
      if (!folder) throw new Error("No folder path provided.");
      const id = await createProjectFromFolderPath(folder);
      res.json(await buildSummary(id));
    }),
  );

  // Re-read the project from disk (after the user edits/swaps files).
  app.post("/api/projects/:id/reload", (req: Request, res: Response) =>
    wrap(res, async () => {
      if (!hasProject(req.params.id)) throw new Error("Project not found.");
      res.json(await buildSummary(req.params.id));
    }),
  );

  // Create a starter book.yaml in the project folder.
  app.post("/api/projects/:id/scaffold", (req: Request, res: Response) =>
    wrap(res, async () => {
      const { book } = await loadProject(req.params.id, bodyMeta(req));
      const dir = await writableBookDir(req.params.id);
      await scaffold(dir, book.meta);
      res.json(await buildSummary(req.params.id));
    }),
  );

  // Persist the Book Details metadata into book.yaml.
  app.post("/api/projects/:id/meta", (req: Request, res: Response) =>
    wrap(res, async () => {
      const meta = req.body?.meta as BookMeta | undefined;
      if (!meta) throw new Error("No metadata provided.");
      const dir = await writableBookDir(req.params.id);
      await saveMeta(dir, meta);
      res.json(await buildSummary(req.params.id));
    }),
  );

  // Persist the typography block into book.yaml.
  app.post("/api/projects/:id/typography", (req: Request, res: Response) =>
    wrap(res, async () => {
      const { book } = await loadProject(req.params.id, bodyMeta(req));
      const dir = await writableBookDir(req.params.id);
      await saveTypography(dir, book.meta, req.body?.typography ?? {});
      res.json(await buildSummary(req.params.id));
    }),
  );

  // Add a front/back matter section from a template.
  app.post("/api/projects/:id/matter", (req: Request, res: Response) =>
    wrap(res, async () => {
      const { book } = await loadProject(req.params.id, bodyMeta(req));
      const dir = await writableBookDir(req.params.id);
      await addMatter(dir, book.meta, {
        type: String(req.body?.type ?? ""),
        placement: req.body?.placement as Placement | undefined,
        title: req.body?.title,
      });
      res.json(await buildSummary(req.params.id));
    }),
  );

  // Remove a matter entry (unlists it; file stays on disk).
  app.delete("/api/projects/:id/matter", (req: Request, res: Response) =>
    wrap(res, async () => {
      const dir = await writableBookDir(req.params.id);
      await removeMatter(dir, String(req.body?.entry ?? ""));
      res.json(await buildSummary(req.params.id));
    }),
  );

  // Reorder a placement's entries.
  app.post("/api/projects/:id/matter/reorder", (req: Request, res: Response) =>
    wrap(res, async () => {
      const dir = await writableBookDir(req.params.id);
      await reorderMatter(dir, req.body?.placement as Placement, (req.body?.order ?? []) as string[]);
      res.json(await buildSummary(req.params.id));
    }),
  );

  // Replace the cover image.
  app.post("/api/projects/:id/cover", upload.single("cover"), (req: Request, res: Response) =>
    wrap(res, async () => {
      if (!hasProject(req.params.id)) throw new Error("Project not found.");
      const file = req.file as Express.Multer.File | undefined;
      if (!file) throw new Error("No cover uploaded.");
      await setProjectCover(req.params.id, file.originalname, file.buffer);
      res.json(await buildSummary(req.params.id));
    }),
  );

  // Serve the current cover image (for the UI thumbnail).
  app.get("/api/projects/:id/cover", (req: Request, res: Response) =>
    wrap(res, async () => {
      const { book } = await loadProject(req.params.id);
      if (!book.coverPath) {
        res.status(404).end();
        return;
      }
      const ext = path.extname(book.coverPath).toLowerCase();
      const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".png" ? "image/png" : "application/octet-stream";
      res.setHeader("Content-Type", mime);
      res.send(await fs.readFile(book.coverPath));
    }),
  );

  // Live preview HTML for the iframe (reflowable ebook).
  app.post("/api/projects/:id/preview", (req: Request, res: Response) =>
    wrap(res, async () => {
      const { book } = await loadProject(req.params.id, bodyMeta(req));
      applyTypography(book, req);
      res.json({ html: await renderHtml(book, "html") });
    }),
  );

  // Paginated print preview (same Paged.js layout as the print PDF).
  app.post("/api/projects/:id/preview-print", (req: Request, res: Response) =>
    wrap(res, async () => {
      const { book } = await loadProject(req.params.id, bodyMeta(req));
      applyTypography(book, req);
      const print: PrintOptions = { ...DEFAULT_PRINT, ...(req.body?.print ?? {}) };
      const { html, meta } = await renderPrintPreviewHtml(book, print);
      res.json({ html, pages: meta.pages, gutter: meta.gutter });
    }),
  );

  /**
   * Export a format.
   *
   * When the project was opened from a real folder on disk, the SERVER writes
   * the file to its configured destination and returns the path — a browser
   * download cannot choose where it lands, so it would always go to Downloads,
   * and version.json would then record a path where nothing exists.
   *
   * Drag-and-dropped projects live in a temp folder with no permanent home, so
   * those still come back as base64 for the browser to download.
   */
  app.post("/api/projects/:id/export", (req: Request, res: Response) =>
    wrap(res, async () => {
      const format = String(req.body?.format ?? "");
      const { book } = await loadProject(req.params.id, bodyMeta(req));
      applyTypography(book, req);
      const stem = slugify(book.meta.title) || "book";
      const info = projectInfo(req.params.id);
      const bookDir = info.onDisk ? info.folder : null;

      /** Write to the book's own destination, or hand back bytes to download. */
      const deliver = async (type: ArtifactType, data: Buffer, mime: string, extra: Record<string, unknown> = {}) => {
        if (!bookDir) {
          res.json({
            filename: `${stem}.${type === "epub-kdp" || type === "epub-universal" ? "epub" : type === "md" ? "md" : type === "docx" ? "docx" : "pdf"}`,
            mime,
            dataBase64: data.toString("base64"),
            bytes: data.length,
            written: false,
            ...extra,
          });
          return;
        }
        const prep = await prepareExport(book, bookDir);
        const result = await finishExport(prep, type, data, {
          force: Boolean(req.body?.force),
          note: typeof req.body?.note === "string" ? req.body.note : undefined,
          confirm: async () => false, // the UI asks, then retries with force
        });
        if (!result.written) {
          res.json({ needsConfirm: true, message: result.conflictMessage, bytes: data.length, ...extra });
          return;
        }
        res.json({
          written: true,
          filename: result.filename,
          path: result.path,
          version: result.version,
          archived: result.archived,
          overwrote: result.overwrote,
          bytes: data.length,
          mime,
          ...extra,
        });
      };

      // The blues needs its version and round BEFORE it renders — both are
      // printed on the cover — so it can't go through `deliver`.
      if (format === "blues") {
        if (!bookDir) {
          throw new Error(
            "A blues is written to your review folder, so it needs a book opened from a folder on disk — not a drag-and-dropped copy.",
          );
        }
        const prep = await prepareExport(book, bookDir, { newRound: Boolean(req.body?.newRound) });
        ensureRoundStarted(prep);
        const round = currentRound(prep);
        const warning = prep.round ? roundWarning(prep.round) : null;
        const pages = Number(req.body?.pages);
        const { buffer, meta } = await renderBlues(book, {
          version: prep.sync.version,
          date: prep.date,
          round: round.round,
          maxRounds: round.maxRounds,
          sourceLabel: path.basename(bookDir),
          maxPages: Number.isFinite(pages) && pages > 0 ? Math.floor(pages) : undefined,
        });
        const result = await finishExport(prep, "blues", buffer, {
          force: Boolean(req.body?.force),
          note: typeof req.body?.note === "string" ? req.body.note : `round ${round.round}`,
          confirm: async () => false,
        });
        if (!result.written) {
          res.json({ needsConfirm: true, message: result.conflictMessage, bytes: buffer.length });
          return;
        }
        res.json({
          written: true,
          filename: result.filename,
          path: result.path,
          version: result.version,
          archived: result.archived,
          overwrote: result.overwrote,
          bytes: buffer.length,
          mime: "application/pdf",
          pages: meta.pages,
          totalPages: meta.totalPages,
          firstChapter: meta.firstChapter,
          lastChapter: meta.lastChapter,
          totalChapters: meta.totalChapters,
          round: round.round,
          maxRounds: round.maxRounds,
          roundWarning: warning,
        });
        return;
      }

      switch (format) {
        case "epub": {
          const preset = (req.body?.preset ?? "universal") as PresetName;
          const { buffer } = await renderEpub(book, preset);
          const validation = await validateEpub(buffer);
          await deliver(preset === "kdp" ? "epub-kdp" : "epub-universal", buffer, "application/epub+zip", { validation });
          return;
        }
        case "docx": {
          const buffer = await renderDocx(book);
          await deliver(
            "docx",
            buffer,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          );
          return;
        }
        case "md": {
          const buffer = Buffer.from(renderMarkdown(book), "utf8");
          await deliver("md", buffer, "text/markdown");
          return;
        }
        case "pdf": {
          const buffer = await renderPdf(book);
          await deliver("reading", buffer, "application/pdf");
          return;
        }
        case "print": {
          const print: PrintOptions = { ...DEFAULT_PRINT, ...(req.body?.print ?? {}) };
          const { buffer, meta } = await renderPrintPdf(book, print);
          await deliver("print", buffer, "application/pdf", { pages: meta.pages, gutter: meta.gutter });
          return;
        }
        default:
          throw new Error(`Unknown format: ${format}`);
      }
    }),
  );
}
