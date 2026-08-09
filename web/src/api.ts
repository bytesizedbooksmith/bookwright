import type { BookMeta, ExportResult, MatterType, Preset, PrintLayout, PrintOptions, PrintPreviewResult, ProjectSummary, Theme, Trim, Typography } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  themes: () => fetch("/api/themes").then((r) => json<Theme[]>(r)),
  presets: () => fetch("/api/presets").then((r) => json<Preset[]>(r)),
  matterTypes: () => fetch("/api/matter-types").then((r) => json<MatterType[]>(r)),
  trims: () => fetch("/api/trims").then((r) => json<Trim[]>(r)),
  printLayouts: () => fetch("/api/print-layouts").then((r) => json<PrintLayout[]>(r)),

  loadSample: () => fetch("/api/sample", { method: "POST" }).then((r) => json<ProjectSummary>(r)),

  pickFolder: (initial?: string) =>
    fetch("/api/pick-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initial }),
    }).then((r) => json<{ path: string | null }>(r)),

  openFolder: (folderPath: string) =>
    fetch("/api/projects/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: folderPath }),
    }).then((r) => json<ProjectSummary>(r)),

  reload: (projectId: string) =>
    fetch(`/api/projects/${projectId}/reload`, { method: "POST" }).then((r) => json<ProjectSummary>(r)),

  saveMeta: (projectId: string, meta: BookMeta) =>
    fetch(`/api/projects/${projectId}/meta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta }),
    }).then((r) => json<ProjectSummary>(r)),

  scaffold: (projectId: string, meta: Partial<BookMeta>) =>
    fetch(`/api/projects/${projectId}/scaffold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta }),
    }).then((r) => json<ProjectSummary>(r)),

  addMatter: (projectId: string, type: string, placement: string, meta: Partial<BookMeta>, title?: string) =>
    fetch(`/api/projects/${projectId}/matter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, placement, title, meta }),
    }).then((r) => json<ProjectSummary>(r)),

  removeMatter: (projectId: string, entry: string) =>
    fetch(`/api/projects/${projectId}/matter`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry }),
    }).then((r) => json<ProjectSummary>(r)),

  reorderMatter: (projectId: string, placement: string, order: string[]) =>
    fetch(`/api/projects/${projectId}/matter/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placement, order }),
    }).then((r) => json<ProjectSummary>(r)),

  uploadFiles: (files: File[]) => {
    const fd = new FormData();
    const relPaths: string[] = [];
    for (const f of files) {
      relPaths.push((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
      fd.append("files", f);
    }
    // Sent explicitly because multer only preserves the file's basename.
    fd.append("relPaths", JSON.stringify(relPaths));
    return fetch("/api/projects", { method: "POST", body: fd }).then((r) => json<ProjectSummary>(r));
  },

  updateCover: (projectId: string, file: File) => {
    const fd = new FormData();
    fd.append("cover", file, file.name);
    return fetch(`/api/projects/${projectId}/cover`, { method: "POST", body: fd }).then((r) =>
      json<ProjectSummary>(r),
    );
  },

  preview: (projectId: string, meta: Partial<BookMeta>, theme: string, typography: Typography) =>
    fetch(`/api/projects/${projectId}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta, theme, typography }),
    }).then((r) => json<{ html: string }>(r)),

  previewPrint: (projectId: string, meta: Partial<BookMeta>, theme: string, print: PrintOptions, typography: Typography) =>
    fetch(`/api/projects/${projectId}/preview-print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta, theme, print, typography }),
    }).then((r) => json<PrintPreviewResult>(r)),

  saveTypography: (projectId: string, meta: BookMeta, typography: Typography) =>
    fetch(`/api/projects/${projectId}/typography`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta, typography }),
    }).then((r) => json<ProjectSummary>(r)),

  export: (
    projectId: string,
    format: string,
    opts: {
      preset?: string;
      meta: Partial<BookMeta>;
      theme: string;
      print?: PrintOptions;
      typography?: Typography;
      pages?: number;
      newRound?: boolean;
      note?: string;
      /** Overwrite an existing artifact at this version, after the user confirms. */
      force?: boolean;
    },
  ) =>
    fetch(`/api/projects/${projectId}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, ...opts }),
    }).then((r) => json<ExportResult>(r)),
};

/**
 * Trigger a browser download from a base64 export result. Only used when the
 * server could NOT write the file itself — a drag-and-dropped project has no
 * permanent folder to write to. Anything opened from a real folder is written
 * server-side to its configured destination instead, because a browser download
 * always lands in Downloads and no code here can change that.
 */
export function downloadResult(result: ExportResult): void {
  if (!result.dataBase64 || !result.filename) return;
  const bin = atob(result.dataBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: result.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
