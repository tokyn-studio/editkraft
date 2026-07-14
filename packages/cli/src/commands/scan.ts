import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";

/**
 * `editkraft scan` — read-only detector for collection candidates
 * (Roadmap 2.8). Finds content that looks like a hardcoded collection
 * (blog posts, team members, …) and suggests an ek field schema for
 * `defineCollection`. It NEVER modifies the project (no `--apply`).
 *
 * Two detectors:
 *
 * (a) Frontmatter directories: folders with >= 3 `.md`/`.mdx` files that
 *     start with a `---` frontmatter block. The frontmatter is read by a
 *     deliberate MINI parser (no gray-matter dependency): only top-level
 *     `key: value` pairs and `|`/`>` block scalars are understood. Nested
 *     maps and list values are treated as plain text (→ ekText).
 *
 * (b) Exported uniform object-array literals in `.ts`/`.tsx`/`.js`/`.jsx`/
 *     `.mjs`/`.cjs` files: `export const xs = [{…}, …]` (or `export default`)
 *     with >= 3 elements that all share the identical key set.
 *
 * Heuristic limits (detector b is regex + brace matching, NOT an AST):
 * - Only array literals directly assigned in an `export` statement are seen;
 *   arrays built via `.map()`, spread (`...`), function calls, or exported
 *   under a different name (`export { posts }`) are missed.
 * - Elements must be object literals with literal `key: value` entries;
 *   shorthand properties, computed keys, and spreads disqualify the array.
 * - Strings and comments are skipped during brace matching, but exotic
 *   syntax (regex literals containing braces, nested template-literal
 *   interpolations with strings) can confuse the matcher — worst case the
 *   candidate is silently dropped, never misreported.
 * - Non-string values (numbers, booleans, nested objects) map to ekText.
 */

export type ScanPrimitive = "ekText" | "ekRichText" | "ekImage" | "ekLink";

export interface SuggestedField {
  key: string;
  primitive: ScanPrimitive;
  optional: boolean;
}

export interface ScanCandidate {
  type: "frontmatter-dir" | "object-array";
  /** Path relative to the scanned root (directory or file). */
  path: string;
  itemCount: number;
  suggestedSchema: SuggestedField[];
  /** Comma-separated guess of the locales involved (e.g. "de, en"). */
  localeHint?: string;
  /** object-array only: the export the array literal is assigned to. */
  exportName?: string;
}

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "supabase",
  "public",
]);
const MAX_DEPTH = 8;
const MAX_FILE_BYTES = 512 * 1024;
const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const IMAGE_RE = /\.(png|jpe?g|webp|gif|svg|avif|ico)(\?.*)?$/i;
// A date stays ekText for now — there is no date primitive yet; revisit
// once ek gains one. Matches ISO-ish dates ("2026-07-14", "2026-07-14T…").
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;
const LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

/** Maps a raw string value to the ek primitive it most likely represents. */
function inferPrimitive(value: string, multiline: boolean): ScanPrimitive {
  if (multiline || value.includes("\n")) return "ekRichText";
  const trimmed = value.trim();
  if (IMAGE_RE.test(trimmed)) return "ekImage";
  if (/^https?:\/\/\S+$/.test(trimmed)) return "ekLink";
  // Date → ekText (as text until a date primitive exists).
  if (DATE_RE.test(trimmed)) return "ekText";
  return "ekText";
}

/** Merges the primitives seen for one key across all items into one suggestion. */
function mergePrimitives(seen: ScanPrimitive[]): ScanPrimitive {
  const first = seen[0] ?? "ekText";
  if (seen.every((s) => s === first)) return first;
  // Mixed values: rich text wins (lossless superset for text), else ekText.
  return seen.includes("ekRichText") ? "ekRichText" : "ekText";
}

// ---------------------------------------------------------------------------
// (a) Frontmatter directories
// ---------------------------------------------------------------------------

interface FrontmatterDoc {
  /** key → { value, multiline } for top-level entries. */
  fields: Map<string, { value: string; multiline: boolean }>;
  hasBody: boolean;
}

/**
 * Mini frontmatter parser: the file must start with a `---` line; everything
 * up to the next `---` line is treated as YAML-ish `key: value` pairs.
 * Supports `|`/`>` block scalars (following indented lines). Nested maps and
 * `- ` list entries are flattened to text. Returns null without frontmatter.
 */
export function parseFrontmatter(content: string): FrontmatterDoc | null {
  const src = content.replace(/^﻿/, "");
  const lines = src.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return null;

  const fields = new Map<string, { value: string; multiline: boolean }>();
  for (let i = 1; i < end; i++) {
    const line = lines[i]!;
    if (line.trim() === "" || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue; // indented/nested line — belongs to a previous key or is skipped
    const key = m[1]!;
    let value = m[2]!.trim();
    let multiline = false;

    if (value === "|" || value === ">" || value === "|-" || value === ">-") {
      // Block scalar: consume following indented lines.
      const block: string[] = [];
      while (i + 1 < end && (lines[i + 1]!.startsWith("  ") || lines[i + 1]!.trim() === "")) {
        block.push(lines[i + 1]!.replace(/^ {2}/, ""));
        i++;
      }
      value = block.join("\n").trim();
      multiline = true;
    } else if (value === "") {
      // Nested map or list: flatten the indented lines to plain text.
      const block: string[] = [];
      while (i + 1 < end && /^\s+\S/.test(lines[i + 1]!)) {
        block.push(lines[i + 1]!.trim().replace(/^-\s*/, ""));
        i++;
      }
      value = block.join(", ");
    } else {
      // Strip symmetric quotes.
      value = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }
    fields.set(key, { value, multiline });
  }

  const body = lines
    .slice(end + 1)
    .join("\n")
    .trim();
  return { fields, hasBody: body.length > 0 };
}

function frontmatterCandidate(root: string, dir: string, files: string[]): ScanCandidate | null {
  const docs: FrontmatterDoc[] = [];
  const localeValues = new Set<string>();
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(join(dir, file), "utf8");
    } catch {
      continue;
    }
    const doc = parseFrontmatter(content);
    if (!doc) continue;
    docs.push(doc);
    // Locale hints: a `locale`/`lang` frontmatter key or a `name.<xx>.md` suffix.
    for (const key of ["locale", "lang"]) {
      const v = doc.fields.get(key)?.value;
      if (v && LOCALE_RE.test(v)) localeValues.add(v);
    }
    const suffix = file.match(/\.([a-z]{2}(?:-[A-Z]{2})?)\.mdx?$/);
    if (suffix) localeValues.add(suffix[1]!);
  }
  if (docs.length < 3) return null;

  const keyStats = new Map<string, { count: number; primitives: ScanPrimitive[] }>();
  for (const doc of docs) {
    for (const [key, { value, multiline }] of doc.fields) {
      const stat = keyStats.get(key) ?? { count: 0, primitives: [] };
      stat.count++;
      stat.primitives.push(inferPrimitive(value, multiline));
      keyStats.set(key, stat);
    }
  }

  const suggestedSchema: SuggestedField[] = [...keyStats.entries()].map(([key, stat]) => ({
    key,
    primitive: mergePrimitives(stat.primitives),
    optional: stat.count < docs.length,
  }));
  // The markdown body below the frontmatter becomes the richText body field.
  const bodies = docs.filter((d) => d.hasBody).length;
  if (bodies > 0 && !keyStats.has("body")) {
    suggestedSchema.push({ key: "body", primitive: "ekRichText", optional: bodies < docs.length });
  }
  if (suggestedSchema.length === 0) return null;

  const candidate: ScanCandidate = {
    type: "frontmatter-dir",
    path: relative(root, dir) || ".",
    itemCount: docs.length,
    suggestedSchema,
  };
  if (localeValues.size > 0) candidate.localeHint = [...localeValues].sort().join(", ");
  return candidate;
}

// ---------------------------------------------------------------------------
// (b) Exported uniform object-array literals (regex + brace matching, no AST)
// ---------------------------------------------------------------------------

/**
 * Given source and the index of an opening bracket, returns the index of its
 * matching closer — skipping strings, template literals, and comments.
 * Returns -1 when unbalanced (we then drop the candidate silently).
 */
function matchBracket(src: string, open: number): number {
  const pairs: Record<string, string> = { "[": "]", "{": "}", "(": ")" };
  const stack: string[] = [];
  for (let i = open; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      // Skip the string/template literal (template interpolations are NOT
      // descended into — a documented limit of this non-AST scanner).
      for (i++; i < src.length; i++) {
        if (src[i] === "\\") i++;
        else if (src[i] === ch) break;
      }
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      i = src.indexOf("\n", i);
      if (i === -1) return -1;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (ch === "]" || ch === "}" || ch === ")") {
      if (stack.pop() !== ch) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

/** Splits `src` on commas at bracket depth 0 (string/comment aware). */
function splitTopLevel(src: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i++; i < src.length; i++) {
        if (src[i] === "\\") i++;
        else if (src[i] === ch) break;
      }
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      i = close === -1 ? src.length : close + 1;
      continue;
    }
    if (ch === "[" || ch === "{" || ch === "(") {
      const close = matchBracket(src, i);
      if (close === -1) return []; // unbalanced → drop
      i = close;
      continue;
    }
    if (ch === ",") {
      parts.push(src.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(src.slice(start));
  return parts.map((s) => s.trim()).filter((s) => s !== "");
}

interface ParsedEntry {
  key: string;
  primitive: ScanPrimitive;
  nullish: boolean;
}

/** Parses one `{ … }` element into its top-level entries; null = not uniform. */
function parseObjectElement(element: string): ParsedEntry[] | null {
  const trimmed = element.trim();
  if (!trimmed.startsWith("{")) return null;
  const close = matchBracket(trimmed, 0);
  if (close === -1) return null;
  const inner = trimmed.slice(1, close);
  const entries: ParsedEntry[] = [];
  for (const part of splitTopLevel(inner)) {
    // Literal `key: value` only — spreads, shorthand, computed keys disqualify.
    const m = part.match(/^(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*([\s\S]+)$/);
    if (!m) return null;
    const key = (m[1] ?? m[2] ?? m[3])!;
    const raw = m[4]!.trim();
    let primitive: ScanPrimitive = "ekText";
    let nullish = false;
    const str = raw.match(/^"((?:[^"\\]|\\.)*)"$|^'((?:[^'\\]|\\.)*)'$|^`([\s\S]*)`$/);
    if (str) {
      const value = (str[1] ?? str[2] ?? str[3] ?? "").replace(/\\n/g, "\n");
      primitive = inferPrimitive(value, value.includes("\n"));
    } else if (raw === "null" || raw === "undefined") {
      nullish = true;
    }
    // Everything else (numbers, booleans, nested structures) → ekText.
    entries.push({ key, primitive, nullish });
  }
  return entries.length > 0 ? entries : null;
}

function objectArrayCandidates(root: string, file: string): ScanCandidate[] {
  let src: string;
  try {
    if (statSync(file).size > MAX_FILE_BYTES) return [];
    src = readFileSync(file, "utf8");
  } catch {
    return [];
  }

  const candidates: ScanCandidate[] = [];
  // `export const name = [` / `export default [` (optional type annotation).
  const exportRe =
    /export\s+(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=|default)\s*\[/g;
  for (let m = exportRe.exec(src); m !== null; m = exportRe.exec(src)) {
    const open = m.index + m[0].length - 1;
    const close = matchBracket(src, open);
    if (close === -1) continue;
    const elements = splitTopLevel(src.slice(open + 1, close));
    if (elements.length < 3) continue;

    const parsed = elements.map(parseObjectElement);
    if (parsed.some((e) => e === null)) continue;
    const items = parsed as ParsedEntry[][];

    // Uniform shape: every element must expose the identical key set.
    const keys = items[0]!.map((e) => e.key).sort();
    const uniform = items.every(
      (e) =>
        e.length === keys.length &&
        e
          .map((x) => x.key)
          .sort()
          .every((k, i) => k === keys[i]),
    );
    if (!uniform) continue;

    const localeValues = new Set<string>();
    const suggestedSchema: SuggestedField[] = keys.map((key) => {
      const entries = items.map((e) => e.find((x) => x.key === key)!);
      const nonNull = entries.filter((e) => !e.nullish);
      return {
        key,
        primitive: mergePrimitives(nonNull.map((e) => e.primitive)),
        optional: nonNull.length < entries.length,
      };
    });
    // Locale hint from a locale/lang key's string values.
    for (const element of elements) {
      const lm = element.match(/(?:locale|lang)\s*:\s*["'`]([a-z]{2}(?:-[A-Z]{2})?)["'`]/);
      if (lm) localeValues.add(lm[1]!);
    }

    const candidate: ScanCandidate = {
      type: "object-array",
      path: relative(root, file),
      itemCount: elements.length,
      suggestedSchema,
      exportName: m[1] ?? "default",
    };
    if (localeValues.size > 0) candidate.localeHint = [...localeValues].sort().join(", ");
    candidates.push(candidate);
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Walker + command
// ---------------------------------------------------------------------------

/** Pure scan logic (testable): walks the tree and collects candidates. */
export function scanProject(root: string): ScanCandidate[] {
  const abs = resolve(root);
  const candidates: ScanCandidate[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const markdownFiles: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), depth + 1);
        continue;
      }
      if (/\.mdx?$/.test(entry.name)) markdownFiles.push(entry.name);
      else if (
        CODE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)) &&
        !entry.name.endsWith(".d.ts")
      ) {
        candidates.push(...objectArrayCandidates(abs, join(dir, entry.name)));
      }
    }
    if (markdownFiles.length >= 3) {
      const candidate = frontmatterCandidate(abs, dir, markdownFiles.sort());
      if (candidate) candidates.push(candidate);
    }
  };

  walk(abs, 0);
  return candidates.sort((a, b) => a.path.localeCompare(b.path));
}

function formatField(field: SuggestedField): string {
  return `${field.key}${field.optional ? "?" : ""}: ${field.primitive}`;
}

/** `editkraft scan` — read-only report; never modifies the project. */
export async function scan(options: { cwd: string; json: boolean }): Promise<number> {
  const candidates = scanProject(options.cwd);

  if (options.json) {
    process.stdout.write(JSON.stringify({ candidates }, null, 2) + "\n");
    return 0;
  }

  p.intro(pc.bgCyan(pc.black(" editkraft scan ")));
  p.log.info("Read-only scan for collection candidates — nothing is modified.");

  if (candidates.length === 0) {
    p.log.message(
      pc.dim(
        "No candidates found (looked for folders with >= 3 frontmatter .md/.mdx " +
          "files and exported uniform object arrays with >= 3 items).",
      ),
    );
    p.outro("0 candidates.");
    return 0;
  }

  for (const c of candidates) {
    const kind =
      c.type === "frontmatter-dir"
        ? "frontmatter dir"
        : `object array (export ${c.exportName})`;
    p.log.message(
      [
        `${pc.green("●")} ${pc.bold(c.path)} ${pc.dim(`— ${kind}, ${c.itemCount} items`)}`,
        `  fields: ${c.suggestedSchema.map(formatField).join(", ")}`,
        ...(c.localeHint ? [`  locales: ${c.localeHint}`] : []),
      ].join("\n"),
    );
  }

  p.note(
    [
      "Next: model each candidate with defineCollection({ slug, name, schema })",
      "and follow the \"Collections & blog\" chapter in docs/MIGRATE.md.",
      "Dates are suggested as ekText until a date primitive exists.",
    ].join("\n"),
    "Suggestion",
  );
  p.outro(pc.green(`${candidates.length} candidate(s) found.`));
  return 0;
}
