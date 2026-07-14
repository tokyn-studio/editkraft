import { describe, expect, it } from "vitest";
import {
  EK_MIGRATIONS,
  collectionsMigration,
  ekMigrations,
  i18nMigration,
  initMigration,
} from "./migrations";

describe("ekMigrations", () => {
  it("liefert die fünf Migrationen in fester Reihenfolge mit CLI-Suffixen", () => {
    expect(ekMigrations().map((m) => m.name)).toEqual([
      "editkraft_init",
      "editkraft_i18n",
      "editkraft_globals",
      "editkraft_symbols",
      "editkraft_collections",
    ]);
  });

  it("jede SQL enthält die Marker ihrer ek_-Tabellen", () => {
    const byName = Object.fromEntries(ekMigrations().map((m) => [m.name, m.sql]));
    expect(byName["editkraft_init"]).toContain("create table if not exists public.ek_pages");
    expect(byName["editkraft_init"]).toContain("public.ek_page_versions");
    expect(byName["editkraft_i18n"]).toContain("alter table public.ek_pages");
    expect(byName["editkraft_globals"]).toContain("public.ek_globals");
    expect(byName["editkraft_symbols"]).toContain("public.ek_symbols");
    expect(byName["editkraft_collections"]).toContain("public.ek_collections");
    expect(byName["editkraft_collections"]).toContain("public.ek_collection_items");
  });

  it("interpoliert die übergebene defaultLocale in i18n- und Collections-SQL", () => {
    const byName = Object.fromEntries(
      ekMigrations({ defaultLocale: "en-US" }).map((m) => [m.name, m.sql]),
    );
    expect(byName["editkraft_i18n"]).toContain("default 'en-US'");
    expect(byName["editkraft_collections"]).toContain("locale text not null default 'en-US'");
  });

  it("nutzt ohne Optionen denselben Default wie das CLI ('de')", () => {
    expect(ekMigrations()).toEqual(ekMigrations({ defaultLocale: "de" }));
  });

  it("ist pur: wiederholte Aufrufe liefern identische Ergebnisse", () => {
    expect(ekMigrations()).toEqual(ekMigrations());
    expect(EK_MIGRATIONS).toEqual(ekMigrations());
    // Neue Arrays pro Aufruf — Konsumenten können nichts Geteiltes mutieren.
    expect(ekMigrations()).not.toBe(ekMigrations());
  });
});

describe("locale validation", () => {
  it("wirft bei einer defaultLocale, die kein reines BCP-47-Token ist", () => {
    // Der Wert wird in DDL interpoliert — ein Quote muss werfen, nicht shippen.
    expect(() => i18nMigration('de"; drop table ek_pages; --')).toThrow(/Invalid defaultLocale/);
    expect(() => collectionsMigration("de'--")).toThrow(/Invalid defaultLocale/);
    expect(() => ekMigrations({ defaultLocale: "de'--" })).toThrow(/Invalid defaultLocale/);
  });
});

describe("initMigration", () => {
  it("enthält die published-only-RLS-Policies", () => {
    const sql = initMigration();
    expect(sql).toContain('create policy "ek public reads published pages"');
    expect(sql).toContain("enable row level security");
    expect(sql).not.toMatch(/grant (insert|update|delete).*anon/i);
  });
});
