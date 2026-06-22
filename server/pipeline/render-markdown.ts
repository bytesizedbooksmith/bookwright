import type { Book } from "./types.ts";
import { assembleCleanMarkdown } from "./build-doc.ts";

/** Compiled, attribute-free Markdown for reuse in other projects. */
export function renderMarkdown(book: Book): string {
  const m = book.meta;
  const header = [`---`, `title: ${m.title}`, `author: ${m.author}`, `language: ${m.language}`];
  if (m.subtitle) header.push(`subtitle: ${m.subtitle}`);
  if (m.series) header.push(`series: ${m.series}`);
  header.push(`---`, "", "");
  return header.join("\n") + assembleCleanMarkdown(book) + "\n";
}
