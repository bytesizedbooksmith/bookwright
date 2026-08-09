// The one path every export takes, whatever produced it.
//
// Split into prepare/finish rather than a single call, because the blues needs
// its version and round number BEFORE it renders — they are printed on the cover
// page. Splitting also means a failed render leaves nothing behind: version.json
// and LINEAGE.md are only written once bytes have landed on disk.

import type { Book } from "./pipeline/types.ts";
import {
  type ArtifactType,
  type DestinationConfig,
  type WritePlan,
  artifactFilename,
  planWrite,
  resolveDestinations,
  writeArtifact,
} from "./destinations.ts";
import {
  type RoundResult,
  type SyncResult,
  appendLineage,
  bumpRound,
  commitSync,
  priorExport,
  recordExport,
  syncVersion,
  today,
} from "./versioning.ts";

export interface PreparedExport {
  sync: SyncResult;
  dest: DestinationConfig;
  date: string;
  round: RoundResult | null;
  bookDir: string;
}

export interface PrepareOptions {
  out?: string; // --out override for the blues destination
  date?: string; // pinned date, for tests
  newRound?: boolean; // --new-round
}

/**
 * Reconcile the version and work out where things will go. Writes nothing.
 * Call before rendering, so the artifact can carry its own version on its face.
 */
export async function prepareExport(book: Book, bookDir: string, opts: PrepareOptions = {}): Promise<PreparedExport> {
  const sync = await syncVersion(book, bookDir);
  const dest = await resolveDestinations(bookDir, opts.out);
  const round = opts.newRound ? bumpRound(sync.file) : null;
  return { sync, dest, date: opts.date ?? today(), round, bookDir };
}

/**
 * The round as it stands, whether or not this run incremented it. Reports the
 * stored value rather than the next one — claiming a round that hasn't started
 * would put a number on the cover that nothing else agrees with.
 */
export function currentRound(prep: PreparedExport): { round: number; maxRounds: number } {
  return {
    round: prep.round?.round ?? prep.sync.file.blues_round ?? 0,
    maxRounds: prep.round?.maxRounds ?? prep.sync.file.max_rounds ?? 3,
  };
}

export interface FinishOptions {
  note?: string; // --note, free text for the LINEAGE row
  force?: boolean; // skip the regenerate prompt
  /** Asked when the source is unchanged and this artifact already exists. */
  confirm?: (message: string) => Promise<boolean>;
}

export interface FinishResult {
  written: boolean; // false when the user declined to regenerate
  path?: string;
  filename?: string;
  archived: string[];
  overwrote: boolean;
  version: number;
  /** Set when nothing was written because the artifact already exists. */
  conflictMessage?: string;
}

/**
 * A blues only exists inside a round, so the first one starts round 1 rather
 * than reporting "round 0" — a number on the cover that nothing else agrees
 * with. Shared by the CLI and the web UI so they can't drift apart.
 */
export function ensureRoundStarted(prep: PreparedExport): void {
  if (!prep.round && (prep.sync.file.blues_round ?? 0) === 0) {
    prep.round = bumpRound(prep.sync.file);
  }
}

/**
 * Write the artifact, archive whatever it supersedes, and record it in both
 * version.json and LINEAGE.md. The metadata is only committed after the file
 * itself is on disk, so a crash can't leave a lineage entry for a file that
 * doesn't exist.
 */
export async function finishExport(
  prep: PreparedExport,
  type: ArtifactType,
  data: Buffer | string,
  opts: FinishOptions = {},
): Promise<FinishResult> {
  const { sync, dest, date, bookDir } = prep;
  const plan: WritePlan = await planWrite(type, dest, sync.version, date);

  // Regenerating the same artifact from an unchanged source is usually a
  // mistake, so it is confirmed rather than assumed.
  if (plan.exists && !opts.force) {
    const prior = priorExport(sync.entry, type);
    const msg =
      `source unchanged since v${sync.version} — ${plan.filename} already exists` +
      `${prior ? ` (written ${prior.at.slice(0, 10)})` : ""}. Regenerate?`;
    const ok = opts.confirm ? await opts.confirm(msg) : false;
    if (!ok) {
      return { written: false, archived: [], overwrote: false, version: sync.version, conflictMessage: msg };
    }
  }

  const result = await writeArtifact(plan, data);

  recordExport(sync.entry, type, result.filename);
  await appendLineage(bookDir, {
    date,
    version: sync.version,
    artifact: type,
    words: sync.words,
    note: opts.note,
  });
  await commitSync(bookDir, sync);

  return {
    written: true,
    path: result.path,
    filename: result.filename,
    archived: result.archived,
    overwrote: result.overwrote,
    version: sync.version,
  };
}

export { artifactFilename };
