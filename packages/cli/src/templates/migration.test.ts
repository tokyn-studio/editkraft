import { describe, expect, it } from "vitest";
import { i18nMigration } from "./migration";

describe("i18nMigration", () => {
  it("rejects a defaultLocale that is not a plain BCP-47-ish token", () => {
    // The value is interpolated into DDL — a quote must throw, not ship.
    expect(() => i18nMigration('de"; drop table ek_pages; --')).toThrow(/Invalid defaultLocale/);
    expect(() => i18nMigration("de'--")).toThrow(/Invalid defaultLocale/);
  });

  it("interpolates a valid locale into the column default", () => {
    expect(i18nMigration("en-US")).toContain("default 'en-US'");
  });
});
