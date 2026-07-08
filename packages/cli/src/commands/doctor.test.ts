import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctorChecks } from "./doctor";
import { applyFiles } from "../fs";
import { generateFiles } from "../generate";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ek-doctor-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function status(checks: ReturnType<typeof runDoctorChecks>, label: string) {
  return checks.find((c) => c.label.includes(label))?.status;
}

describe("runDoctorChecks", () => {
  it("meldet fehlende Einrichtung auf leerem Projekt", () => {
    const checks = runDoctorChecks(dir);
    expect(status(checks, "editkraft.config.ts")).toBe("fail");
    expect(status(checks, "Migration")).toBe("fail");
    expect(status(checks, "Registry")).toBe("fail");
  });

  it("ist grün nach init (Config/Registry/Migration vorhanden)", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { next: "15" } }));
    mkdirSync(join(dir, "app"));
    applyFiles(dir, generateFiles({ srcDir: false, timestamp: "20260101000000" }));

    const checks = runDoctorChecks(dir);
    expect(status(checks, "editkraft.config.ts")).toBe("ok");
    expect(status(checks, "Registry")).toBe("ok");
    expect(status(checks, "Migration")).toBe("ok");
    expect(status(checks, "App Router")).toBe("ok");
  });

  it("erkennt gesetzte ENV aus .env.local", () => {
    writeFileSync(
      join(dir, ".env.local"),
      [
        "SUPABASE_URL=https://x.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY=secret",
        "EDITKRAFT_REVALIDATE_SECRET=abc",
        "NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN=https://studio.editkraft.dev",
        "EDITKRAFT_PREVIEW_SECRET=def",
      ].join("\n"),
    );
    expect(status(runDoctorChecks(dir), "ENV")).toBe("ok");
  });
});
