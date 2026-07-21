import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planUpdate, detectPackageManager, currentVersion, isBreaking } from "./update";

describe("currentVersion", () => {
  it("strips range prefixes", () => {
    expect(currentVersion("^0.13.0")).toBe("0.13.0");
    expect(currentVersion("~1.2.3")).toBe("1.2.3");
    expect(currentVersion(">=0.10.0 <0.11.0")).toBe("0.10.0");
    expect(currentVersion("0.13.0")).toBe("0.13.0");
  });
});

describe("isBreaking", () => {
  it("flags major bumps and 0.x minor bumps, not patches", () => {
    expect(isBreaking("0.13.0", "0.13.4")).toBe(false); // 0.x patch
    expect(isBreaking("0.13.0", "0.14.0")).toBe(true); // 0.x minor = breaking per contract
    expect(isBreaking("1.2.0", "1.9.3")).toBe(false); // >=1 minor/patch = safe
    expect(isBreaking("1.2.0", "2.0.0")).toBe(true); // major
  });
});

describe("planUpdate", () => {
  it("finds present @editkraft packages and computes outdated + breaking", () => {
    const pkg = {
      dependencies: { "@editkraft/react": "^0.12.0", next: "15" },
      devDependencies: { "@editkraft/schema": "^0.10.0" },
    };
    const { targets, outdated } = planUpdate(pkg, {
      "@editkraft/react": "0.13.0",
      "@editkraft/schema": "0.10.0",
    });

    expect(targets.map((t) => t.name).sort()).toEqual(["@editkraft/react", "@editkraft/schema"]);
    // react is outdated (0.12 → 0.13, breaking for 0.x); schema is already latest
    expect(outdated.map((t) => t.name)).toEqual(["@editkraft/react"]);

    const react = targets.find((t) => t.name === "@editkraft/react")!;
    expect(react).toMatchObject({ from: "^0.12.0", to: "0.13.0", where: "dependencies", breaking: true });
    const schema = targets.find((t) => t.name === "@editkraft/schema")!;
    expect(schema.where).toBe("devDependencies");
  });

  it("returns no targets when no @editkraft packages are present", () => {
    expect(planUpdate({ dependencies: { next: "15" } }, {}).targets).toEqual([]);
  });

  it("treats a package with no fetched latest as up to date", () => {
    const { outdated } = planUpdate({ dependencies: { "@editkraft/react": "^0.12.0" } }, {});
    expect(outdated).toEqual([]);
  });
});

describe("detectPackageManager", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));
  it("detects the package manager from the lockfile (npm by default)", () => {
    dir = mkdtempSync(join(tmpdir(), "ek-upd-"));
    expect(detectPackageManager(dir)).toBe("npm");
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(dir)).toBe("pnpm");
  });
});
