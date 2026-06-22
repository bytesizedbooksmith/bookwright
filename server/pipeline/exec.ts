import { spawn } from "node:child_process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run a command, optionally piping `input` to stdin. Never rejects on non-zero exit. */
export function run(
  command: string,
  args: string[],
  opts: { input?: string | Buffer; cwd?: string } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: opts.cwd, windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 0,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
    if (opts.input !== undefined) {
      child.stdin.write(opts.input);
    }
    child.stdin.end();
  });
}

/** Whether a command exists on PATH (used to detect optional tools like java). */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const probe = process.platform === "win32" ? "where" : "which";
    const r = await run(probe, [command]);
    return r.code === 0;
  } catch {
    return false;
  }
}
