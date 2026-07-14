import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter, scanProject } from "./scan";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ek-scan-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function post(title: string, extra = "", body = "Hello **world**.\n\nMore text.") {
  return `---\ntitle: ${title}\ndate: 2026-07-01\n${extra}---\n\n${body}\n`;
}

describe("parseFrontmatter", () => {
  it("parses top-level key/value pairs and detects the body", () => {
    const doc = parseFrontmatter(post("Hi", 'image: /img/a.png\nurl: "https://x.de"\n'));
    expect(doc).not.toBeNull();
    expect(doc!.fields.get("title")?.value).toBe("Hi");
    expect(doc!.fields.get("image")?.value).toBe("/img/a.png");
    expect(doc!.fields.get("url")?.value).toBe("https://x.de");
    expect(doc!.hasBody).toBe(true);
  });

  it("supports block scalars as multiline values", () => {
    const doc = parseFrontmatter("---\nteaser: |\n  line one\n  line two\n---\nbody");
    expect(doc!.fields.get("teaser")).toEqual({ value: "line one\nline two", multiline: true });
  });

  it("returns null without a frontmatter block", () => {
    expect(parseFrontmatter("# Just markdown\n\nNo frontmatter.")).toBeNull();
  });
});

describe("scanProject: frontmatter directories", () => {
  it("erkennt einen mdx-Ordner mit >= 3 Frontmatter-Dateien (Snapshot)", () => {
    const blog = join(dir, "content", "blog");
    mkdirSync(blog, { recursive: true });
    writeFileSync(join(blog, "a.mdx"), post("A", "image: /img/a.jpg\n"));
    writeFileSync(join(blog, "b.mdx"), post("B", "image: /img/b.jpg\n"));
    writeFileSync(
      join(blog, "c.mdx"),
      post("C", "image: /img/c.jpg\nsource: https://example.com/ref\n"),
    );

    const candidates = scanProject(dir);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchSnapshot();
  });

  it("ignoriert Ordner mit weniger als 3 Frontmatter-Dateien", () => {
    const blog = join(dir, "content", "blog");
    mkdirSync(blog, { recursive: true });
    writeFileSync(join(blog, "a.md"), post("A"));
    writeFileSync(join(blog, "b.md"), post("B"));
    writeFileSync(join(blog, "c.md"), "# no frontmatter at all\n");
    expect(scanProject(dir)).toEqual([]);
  });

  it("liefert einen localeHint aus Datei-Suffixen und frontmatter locale", () => {
    const blog = join(dir, "posts");
    mkdirSync(blog, { recursive: true });
    writeFileSync(join(blog, "a.de.md"), post("A"));
    writeFileSync(join(blog, "a.en.md"), post("A (en)"));
    writeFileSync(join(blog, "b.de.md"), post("B", "locale: de\n"));

    const [candidate] = scanProject(dir);
    expect(candidate?.localeHint).toBe("de, en");
  });
});

describe("scanProject: exported object arrays", () => {
  it("erkennt ein gleichförmiges exportiertes Objekt-Array (Snapshot)", () => {
    mkdirSync(join(dir, "data"));
    writeFileSync(
      join(dir, "data", "posts.ts"),
      `export interface Post { title: string }
export const posts = [
  { title: "One", date: "2026-01-01", cover: "/img/one.png", href: "https://a.de/1", views: 10 },
  { title: "Two", date: "2026-02-01", cover: "/img/two.png", href: "https://a.de/2", views: 20 },
  { title: "Three", date: "2026-03-01", cover: "/img/three.png", href: "https://a.de/3", views: 30 },
];
`,
    );
    const candidates = scanProject(dir);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchSnapshot();
  });

  it("verwirft Arrays ohne identische Key-Menge oder mit < 3 Elementen", () => {
    mkdirSync(join(dir, "data"));
    writeFileSync(
      join(dir, "data", "mixed.ts"),
      `export const mixed = [
  { title: "One", date: "2026-01-01" },
  { title: "Two" },
  { title: "Three", date: "2026-03-01" },
];
export const short = [{ a: "x" }, { a: "y" }];
`,
    );
    expect(scanProject(dir)).toEqual([]);
  });

  it("markiert null-Werte als optional und erkennt export default", () => {
    mkdirSync(join(dir, "data"));
    writeFileSync(
      join(dir, "data", "team.js"),
      `export default [
  { name: "Ada", bio: "First line\\nSecond line", photo: null },
  { name: "Grace", bio: "Compiler", photo: "/img/grace.jpg" },
  { name: "Edsger", bio: "Structured", photo: null },
];
`,
    );
    const [candidate] = scanProject(dir);
    expect(candidate?.exportName).toBe("default");
    expect(candidate?.suggestedSchema).toContainEqual({
      key: "photo",
      primitive: "ekImage",
      optional: true,
    });
    expect(candidate?.suggestedSchema).toContainEqual({
      key: "bio",
      primitive: "ekRichText",
      optional: false,
    });
  });
});

describe("scanProject: Negativfall", () => {
  it("findet in einem Projekt ohne Kandidaten nichts", () => {
    mkdirSync(join(dir, "app"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "15" } }));
    writeFileSync(join(dir, "app", "page.tsx"), "export default function Page() { return null }\n");
    writeFileSync(join(dir, "README.md"), "# Readme without frontmatter\n");
    // node_modules is skipped even if it contains matching structures:
    const nm = join(dir, "node_modules", "pkg");
    mkdirSync(nm, { recursive: true });
    writeFileSync(
      join(nm, "x.ts"),
      'export const xs = [{ a: "1" }, { a: "2" }, { a: "3" }];\n',
    );
    expect(scanProject(dir)).toEqual([]);
  });
});
