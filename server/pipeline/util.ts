// Small shared helpers.

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "section"
  );
}

/** Pull a leading "# Title" line off a markdown body, if present. */
export function extractTitle(markdown: string): { title?: string; body: string } {
  const lines = markdown.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const m = lines[i]?.match(/^#\s+(.+?)\s*#*\s*$/);
  if (m) {
    const body = lines
      .slice(i + 1)
      .join("\n")
      .replace(/^\s+/, "");
    return { title: m[1].trim(), body };
  }
  return { body: markdown };
}

/**
 * Pull a leading "## Subtitle" line off a chapter body, used for the optional
 * chapter subtitle. Only the first non-empty line is considered, so ordinary
 * "##" subheadings later in the chapter are untouched.
 */
export function extractSubtitle(markdown: string): { subtitle?: string; body: string } {
  const lines = markdown.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const m = lines[i]?.match(/^##\s+(.+?)\s*#*\s*$/);
  if (m) {
    const body = lines
      .slice(i + 1)
      .join("\n")
      .replace(/^\s+/, "");
    return { subtitle: m[1].trim(), body };
  }
  return { body: markdown };
}

/** Split a single markdown document into chapters on each top-level "# Heading". */
export function splitOnH1(markdown: string): { title: string; body: string }[] {
  const lines = markdown.split(/\r?\n/);
  const chapters: { title: string; body: string[] }[] = [];
  let current: { title: string; body: string[] } | null = null;
  let inFence = false;

  for (const line of lines) {
    if (/^(```|~~~)/.test(line.trim())) inFence = !inFence;
    const h1 = !inFence && line.match(/^#\s+(.+?)\s*#*\s*$/);
    if (h1) {
      if (current) chapters.push(current);
      current = { title: h1[1].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) chapters.push(current);
  return chapters.map((c) => ({ title: c.title, body: c.body.join("\n").trim() }));
}

/** Ensure ids are unique within a book. */
export function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

export function escapeYaml(value: string): string {
  // Quote and escape for a double-quoted YAML scalar.
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}
