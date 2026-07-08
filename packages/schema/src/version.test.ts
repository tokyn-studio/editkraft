import { afterEach, describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  satisfies,
  isCompatible,
  majorOf,
  migrateContent,
  registerMigration,
  _resetMigrations,
} from "./version";
import { emptyPageContent, type PageContent } from "./block";

afterEach(() => _resetMigrations());

describe("SCHEMA_VERSION", () => {
  it("ist eine gültige SemVer", () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("satisfies", () => {
  it("Caret-Ranges", () => {
    expect(satisfies("0.1.0", "^0.1.0")).toBe(true);
    expect(satisfies("0.1.9", "^0.1.0")).toBe(true);
    expect(satisfies("0.2.0", "^0.1.0")).toBe(false); // ^0.1 begrenzt auf <0.2
    expect(satisfies("1.5.0", "^1.2.0")).toBe(true);
    expect(satisfies("2.0.0", "^1.2.0")).toBe(false);
  });

  it("Tilde-Ranges", () => {
    expect(satisfies("1.2.9", "~1.2.0")).toBe(true);
    expect(satisfies("1.3.0", "~1.2.0")).toBe(false);
  });

  it("Wildcards und exakte Versionen", () => {
    expect(satisfies("9.9.9", "*")).toBe(true);
    expect(satisfies("1.0.0", "1.0.0")).toBe(true);
    expect(satisfies("1.0.1", "1.0.0")).toBe(false);
  });

  it("Komparator-Sets (UND) und ODER", () => {
    expect(satisfies("1.5.0", ">=1.0.0 <2.0.0")).toBe(true);
    expect(satisfies("2.0.0", ">=1.0.0 <2.0.0")).toBe(false);
    expect(satisfies("3.0.0", "^1.0.0 || ^3.0.0")).toBe(true);
  });

  it("majorOf", () => {
    expect(majorOf("2.5.1")).toBe(2);
  });

  it("wirft bei ungültiger Version", () => {
    expect(() => satisfies("abc", "^1.0.0")).toThrow();
  });
});

describe("isCompatible", () => {
  it("delegiert an satisfies", () => {
    expect(isCompatible("0.1.3", "^0.1.0")).toBe(true);
    expect(isCompatible("0.2.0", "^0.1.0")).toBe(false);
  });
});

describe("migrateContent", () => {
  it("gleiche Version → unverändert", () => {
    const c = emptyPageContent();
    expect(migrateContent(c, SCHEMA_VERSION)).toBe(c);
  });

  it("gleiche Major, andere Minor/Patch → nur neu gestempelt", () => {
    const c: PageContent = { schemaVersion: "0.1.0", blocks: [] };
    expect(migrateContent(c, "0.3.0").schemaVersion).toBe("0.3.0");
  });

  it("Major-Sprung ohne Migration → wirft mit Handlungsanweisung", () => {
    const c: PageContent = { schemaVersion: "1.0.0", blocks: [] };
    expect(() => migrateContent(c, "2.0.0")).toThrowError(/Keine Migration/);
  });

  it("registrierte Migration wird über Major-Grenzen angewandt", () => {
    registerMigration({
      from: "1.0.0",
      to: "2.0.0",
      migrate: (content) => ({
        ...content,
        blocks: [...content.blocks, { id: "added", type: "Spacer", props: {} }],
      }),
    });
    const result = migrateContent({ schemaVersion: "1.0.0", blocks: [] }, "2.0.0");
    expect(result.schemaVersion).toBe("2.0.0");
    expect(result.blocks).toHaveLength(1);
  });
});
