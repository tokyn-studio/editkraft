import { describe, expect, it } from "vitest";
import { generateFiles } from "./generate";

const FIXED = "20260101000000";

describe("generateFiles", () => {
  it("erzeugt die erwarteten Zielpfade (ohne src/)", () => {
    const paths = generateFiles({ srcDir: false, timestamp: FIXED }).map((f) => f.path);
    expect(paths).toEqual([
      `supabase/migrations/${FIXED}_editkraft_init.sql`,
      // One second after init, so filename sort applies init first.
      "supabase/migrations/20260101000001_editkraft_i18n.sql",
      // Two seconds after init, sorts (and applies) after i18n.
      "supabase/migrations/20260101000002_editkraft_globals.sql",
      "editkraft.config.ts",
      "blocks/registry.ts",
      "blocks/Hero.tsx",
      "app/api/editkraft/revalidate/route.ts",
      "app/editkraft/preview/[[...slug]]/page.tsx",
      "app/editkraft/preview/preview-client.tsx",
      "app/[...slug]/page.tsx",
      ".env.editkraft.example",
    ]);
  });

  it("legt Blöcke und Routen unter src/ ab, wenn srcDir", () => {
    const paths = generateFiles({ srcDir: true, timestamp: FIXED }).map((f) => f.path);
    expect(paths).toContain("src/blocks/registry.ts");
    expect(paths).toContain("src/app/api/editkraft/revalidate/route.ts");
    // Migration und Config bleiben an der Wurzel
    expect(paths).toContain(`supabase/migrations/${FIXED}_editkraft_init.sql`);
    expect(paths).toContain("editkraft.config.ts");
  });

  it("Snapshot des generierten Inhalts ist stabil", () => {
    const files = Object.fromEntries(
      generateFiles({ srcDir: false, timestamp: FIXED }).map((f) => [f.path, f.content]),
    );
    expect(files).toMatchSnapshot();
  });

  it("Migration enthält die published-only-RLS-Policies", () => {
    const migration = generateFiles({ srcDir: false, timestamp: FIXED })[0]!.content;
    expect(migration).toContain("ek public reads published pages");
    expect(migration).toContain("status = 'published' and published_version_id is not null");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("grant select on public.ek_pages to anon, authenticated");
    // Kein Schreibrecht für anon/authenticated
    expect(migration).not.toMatch(/grant (insert|update|delete).*anon/i);
  });

  it("emits the i18n migration as a second, separate file", () => {
    const files = generateFiles({ timestamp: "20260710120000", srcDir: false });
    const i18n = files.find(
      (f) => f.path === "supabase/migrations/20260710120001_editkraft_i18n.sql",
    );
    expect(i18n).toBeDefined();
    expect(i18n!.content).toContain("add column if not exists locale");
    expect(i18n!.content).toContain("translation_group_id");
    expect(i18n!.content).toContain("ek_pages_slug_locale_key");
    // The init migration stays untouched:
    const init = files.find((f) => f.path.endsWith("_editkraft_init.sql"));
    expect(init!.content).not.toContain("locale");
  });

  it("i18n migration sorts (and applies) strictly after the init migration", () => {
    // Supabase keys schema_migrations on the version timestamp and applies
    // files in filename-sort order — identical timestamps would collide AND
    // run `_editkraft_i18n` before `_editkraft_init` ("1" < "n").
    const paths = generateFiles({ timestamp: "20261231235959", srcDir: false }).map(
      (f) => f.path,
    );
    const initPath = paths.find((p) => p.endsWith("_editkraft_init.sql"))!;
    const i18nPath = paths.find((p) => p.endsWith("_editkraft_i18n.sql"))!;
    const timestampOf = (p: string) => p.split("/").pop()!.split("_")[0]!;
    expect(BigInt(timestampOf(i18nPath))).toBeGreaterThan(BigInt(timestampOf(initPath)));
    // Filename sort (the real-world apply order) puts init first:
    expect([initPath, i18nPath].sort()).toEqual([initPath, i18nPath]);
  });

  it("emits the globals migration as a third, separate file", () => {
    const files = generateFiles({ timestamp: "20260710120000", srcDir: false });
    const globals = files.find(
      (f) => f.path === "supabase/migrations/20260710120002_editkraft_globals.sql",
    );
    expect(globals).toBeDefined();
    expect(globals!.content).toContain("create table if not exists public.ek_globals");
    expect(globals!.content).toContain("check (id = 1)");
    // Draft nie öffentlich lesbar: Spalten-GRANT ohne draft + Published-Policy.
    expect(globals!.content).toContain("revoke all on public.ek_globals from anon, authenticated");
    expect(globals!.content).toContain(
      "grant select (id, published, updated_at) on public.ek_globals to anon, authenticated",
    );
    expect(globals!.content).toContain("ek public reads published globals");
    expect(globals!.content).not.toMatch(/grant select \([^)]*draft/);
    // Die Einzelzeile wird direkt angelegt (Upsert-Ziel für das Studio):
    expect(globals!.content).toContain("insert into public.ek_globals (id) values (1)");
  });

  it("Preview-Route nutzt Draft-Token statt Draft-Mode-Cookie", () => {
    const files = Object.fromEntries(
      generateFiles({ srcDir: false, timestamp: FIXED }).map((f) => [f.path, f.content]),
    );
    const preview = files["app/editkraft/preview/[[...slug]]/page.tsx"]!;
    expect(preview).toContain("verifyDraftToken");
    expect(preview).not.toContain("draftMode");
    const env = files[".env.editkraft.example"]!;
    expect(env).toContain("EDITKRAFT_PREVIEW_SECRET");
  });
});
