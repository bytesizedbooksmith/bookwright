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
  app.get("/api/health", (_req, res) => res.json({ ok: true, name: "byte-sized-book-formatter", version: "1.1.0" }));
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

  // Export a format. Returns base64 so the UI can download and show validation together.
  app.post("/api/projects/:id/export", (req: Request, res: Response) =>
    wrap(res, async () => {
      const format = String(req.body?.format ?? "");
      const { book } = await loadProject(req.params.id, bodyMeta(req));
      applyTypography(book, req);
      const stem = slugify(book.meta.title) || "book";

      switch (format) {
        case "epub": {
          const preset = (req.body?.preset ?? "universal") as PresetName;
          const { buffer, bytes } = await renderEpub(book, preset);
          const validation = await validateEpub(buffer);
          res.json({
            filename: `${stem}-${preset}.epub`,
            mime: "application/epub+zip",
            dataBase64: buffer.toString("base64"),
            bytes,
            validation,
          });
          return;
        }
        case "docx": {
          const buffer = await renderDocx(book);
          res.json({
            filename: `${stem}.docx`,
            mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            dataBase64: buffer.toString("base64"),
            bytes: buffer.length,
          });
          return;
        }
        case "md": {
          const buffer = Buffer.from(renderMarkdown(book), "utf8");
          res.json({ filename: `${stem}.md`, mime: "text/markdown", dataBase64: buffer.toString("base64"), bytes: buffer.length });
          return;
        }
        case "pdf": {
          const buffer = await renderPdf(book);
          res.json({ filename: `${stem}.pdf`, mime: "application/pdf", dataBase64: buffer.toString("base64"), bytes: buffer.length });
          return;
        }
        case "print": {
          const print: PrintOptions = { ...DEFAULT_PRINT, ...(req.body?.print ?? {}) };
          const { buffer, meta } = await renderPrintPdf(book, print);
          res.json({
            filename: `${stem}-print-${print.trim}.pdf`,
            mime: "application/pdf",
            dataBase64: buffer.toString("base64"),
            bytes: buffer.length,
            pages: meta.pages,
            gutter: meta.gutter,
          });
          return;
        }
        default:
          throw new Error(`Unknown format: ${format}`);
      }
    }),
  );
}
