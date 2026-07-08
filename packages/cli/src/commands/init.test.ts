import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "./init";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ek-init-"));
  // Prompts-Ausgabe im Test unterdrücken
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeNextProject() {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "15" } }));
  mkdirSync(join(dir, "app"));
  mkdirSync(join(dir, "supabase"));
  writeFileSync(join(dir, "supabase", "config.toml"), "");
}

describe("init (End-to-End auf synthetischem Next-Projekt)", () => {
  it("läuft fehlerfrei durch und legt alle Dateien an", async () => {
    makeNextProject();
    const code = await init({ cwd: dir, yes: true, force: false, timestamp: "20260101000000" });
    expect(code).toBe(0);
    expect(existsSync(join(dir, "editkraft.config.ts"))).toBe(true);
    expect(existsSync(join(dir, "blocks", "registry.ts"))).toBe(true);
    expect(
      existsSync(join(dir, "supabase", "migrations", "20260101000000_editkraft_init.sql")),
    ).toBe(true);
    expect(existsSync(join(dir, "app", "editkraft", "preview", "[[...slug]]", "page.tsx"))).toBe(
      true,
    );
  });

  it("legt bei erneutem Lauf keine zweite Migration an (reuse per Timestamp)", async () => {
    makeNextProject();
    await init({ cwd: dir, yes: true, force: false, timestamp: "20260101000000" });
    // zweiter Lauf OHNE Timestamp → muss die vorhandene Migration wiederverwenden
    await init({ cwd: dir, yes: true, force: false });
    const { readdirSync } = await import("node:fs");
    const migrations = readdirSync(join(dir, "supabase", "migrations")).filter((f) =>
      f.endsWith("_editkraft_init.sql"),
    );
    expect(migrations).toEqual(["20260101000000_editkraft_init.sql"]);
  });

  it("ist idempotent: zweiter Lauf überschreibt manuelle Änderungen nicht", async () => {
    makeNextProject();
    await init({ cwd: dir, yes: true, force: false, timestamp: "20260101000000" });
    const configPath = join(dir, "editkraft.config.ts");
    writeFileSync(configPath, "// meine Anpassung");

    const code = await init({ cwd: dir, yes: true, force: false, timestamp: "20260101000000" });
    expect(code).toBe(0);
    expect(readFileSync(configPath, "utf8")).toBe("// meine Anpassung");
  });
});
