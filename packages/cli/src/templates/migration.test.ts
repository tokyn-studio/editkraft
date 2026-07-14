import { describe, expect, it } from "vitest";
import { i18nMigration, collectionsMigration } from "./migration";

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

describe("collectionsMigration", () => {
  it("rejects a defaultLocale that is not a plain BCP-47-ish token", () => {
    expect(() => collectionsMigration('de"; drop table ek_collections; --')).toThrow(
      /Invalid defaultLocale/,
    );
    expect(() => collectionsMigration("de'--")).toThrow(/Invalid defaultLocale/);
  });

  it("interpolates a valid locale into the items' locale default", () => {
    expect(collectionsMigration("en-US")).toContain("locale text not null default 'en-US'");
  });

  it("anon reads collections freely but items published-only", () => {
    const sql = collectionsMigration("de");
    expect(sql).toContain('create policy "ek public reads collections"');
    expect(sql).toContain('create policy "ek public reads published collection items"');
    expect(sql).toContain("using (published_data is not null)");
    expect(sql).not.toMatch(/grant (insert|update|delete).*anon/i);
  });
});
