import { describe, expect, it } from "vitest";
import { generateFiles } from "./generate";

const FIXED = "20260101000000";

describe("generateFiles", () => {
  it("erzeugt die erwarteten Zielpfade (ohne src/)", () => {
    const paths = generateFiles({ srcDir: false, timestamp: FIXED }).map((f) => f.path);
    expect(paths).toEqual([
      `supabase/migrations/${FIXED}_editkraft_init.sql`,
      "editkraft.config.ts",
      "blocks/registry.ts",
      "blocks/Hero.tsx",
      "app/api/editkraft/revalidate/route.ts",
      "app/editkraft/preview/[[...slug]]/page.tsx",
      "app/editkraft/preview/preview-client.tsx",
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
