// Tagged application errors. The pipeline throws these at the point a failure is
// understood (missing Pandoc, a Pandoc non-zero exit, a Chromium launch failure,
// a malformed book.yaml); the API layer (server/api.ts `wrap`) maps them to an
// HTTP status and an actionable message instead of collapsing everything to a
// raw 400. See reviews/2026-07-02-code-lens.md #1.

export type AppErrorCode =
  | "PANDOC_MISSING" // pandoc binary not found on PATH
  | "PANDOC_FAILED" // pandoc ran but exited non-zero (bad input, etc.)
  | "CHROMIUM_LAUNCH" // puppeteer/Chromium couldn't start (e.g. interrupted download)
  | "CHROMIUM_RENDER" // Chromium launched but threw during pagination/PDF
  | "BAD_CONFIG" // book.yaml is present but not valid YAML
  | "IO_ERROR" // a file couldn't be read/written
  | "BAD_REQUEST"; // the request itself was malformed

const STATUS: Record<AppErrorCode, number> = {
  PANDOC_MISSING: 503,
  PANDOC_FAILED: 422,
  CHROMIUM_LAUNCH: 503,
  CHROMIUM_RENDER: 500,
  BAD_CONFIG: 400,
  IO_ERROR: 500,
  BAD_REQUEST: 400,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** User-facing, actionable message (safe to show in the UI). */
  readonly userMessage: string;
  /** Optional extra context (e.g. the tail of Pandoc's stderr). */
  readonly detail?: string;
  readonly status: number;

  constructor(code: AppErrorCode, userMessage: string, opts: { detail?: string; cause?: unknown } = {}) {
    super(userMessage, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
    this.detail = opts.detail;
    this.status = STATUS[code];
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Keep only the last `n` non-blank lines of a long output blob (e.g. stderr). */
export function tailLines(s: string, n = 40): string {
  const lines = s.replace(/\s+$/, "").split(/\r?\n/);
  return lines.length <= n ? lines.join("\n") : lines.slice(-n).join("\n");
}
