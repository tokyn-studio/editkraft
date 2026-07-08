import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyFiles, detectProject } from "./fs";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ek-fs-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("detectProject", () => {
  it("erkennt Next App Router (app/) und Supabase", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "15" } }));
    mkdirSync(join(dir, "app"));
    mkdirSync(join(dir, "supabase"));
    writeFileSync(join(dir, "supabase", "config.toml"), "");
    const info = detectProject(dir);
    expect(info.isNext).toBe(true);
    expect(info.isAppRouter).toBe(true);
    expect(info.srcDir).toBe(false);
    expect(info.hasSupabase).toBe(true);
  });

  it("erkennt src/app-Layout", () => {
    mkdirSync(join(dir, "src", "app"), { recursive: true });
    expect(detectProject(dir).srcDir).toBe(true);
  });
});

describe("applyFiles (Idempotenz)", () => {
  const specs = [
    { path: "a/b.txt", content: "hallo" },
    { path: "c.txt", content: "welt" },
  ];

  it("erstellt neue Dateien", () => {
    const results = applyFiles(dir, specs);
    expect(results.every((r) => r.outcome === "created")).toBe(true);
    expect(readFileSync(join(dir, "a/b.txt"), "utf8")).toBe("hallo");
  });

  it("überschreibt vorhandene Dateien NICHT (skipped)", () => {
    applyFiles(dir, specs);
    writeFileSync(join(dir, "c.txt"), "manuell geändert");
    const results = applyFiles(dir, specs);
    expect(results.find((r) => r.path === "c.txt")?.outcome).toBe("skipped");
    expect(readFileSync(join(dir, "c.txt"), "utf8")).toBe("manuell geändert");
  });

  it("identischer Inhalt → identical", () => {
    applyFiles(dir, specs);
    const results = applyFiles(dir, specs);
    expect(results.every((r) => r.outcome === "identical")).toBe(true);
  });

  it("mit force wird überschrieben", () => {
    applyFiles(dir, specs);
    writeFileSync(join(dir, "c.txt"), "manuell");
    const results = applyFiles(dir, specs, { force: true });
    expect(results.find((r) => r.path === "c.txt")?.outcome).toBe("created");
    expect(readFileSync(join(dir, "c.txt"), "utf8")).toBe("welt");
  });

  it("legt fehlende Verzeichnisse an", () => {
    applyFiles(dir, specs);
    expect(existsSync(join(dir, "a"))).toBe(true);
  });
});
