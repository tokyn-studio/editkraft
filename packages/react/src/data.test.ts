import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublishedPage, defaultSupportedRange, pageTag } from "./data";
import { EditkraftSchemaError, EditkraftError } from "./errors";

/**
 * Mini-Fake eines Supabase-Query-Builders: liefert nacheinander die für
 * ek_pages bzw. ek_page_versions hinterlegten Ergebnisse.
 */
function fakeSupabase(results: {
  page?: { data: unknown; error?: unknown };
  version?: { data: unknown; error?: unknown };
}): SupabaseClient {
  const chain = (result: { data: unknown; error?: unknown }) => {
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) builder[m] = () => builder;
    builder.maybeSingle = async () => result ?? { data: null, error: null };
    return builder;
  };
  return {
    from(table: string) {
      if (table === "ek_pages") return chain(results.page ?? { data: null }) as never;
      return chain(results.version ?? { data: null }) as never;
    },
  } as unknown as SupabaseClient;
}

const publishedPage = {
  slug: "start",
  title: "Startseite",
  meta: {},
  status: "published",
  published_version_id: "v1",
};

describe("loadPublishedPage", () => {
  it("lädt published Seite + Version und validiert den Blocktree", async () => {
    const supabase = fakeSupabase({
      page: { data: publishedPage },
      version: {
        data: {
          content: {
            schemaVersion: "0.1.0",
            blocks: [{ id: "a", type: "Heading", props: { headline: "Hi" } }],
          },
          schema_version: "0.1.0",
        },
      },
    });
    const page = await loadPublishedPage(supabase, "start");
    expect(page?.title).toBe("Startseite");
    expect(page?.content.blocks).toHaveLength(1);
  });

  it("gibt null zurück, wenn keine published Seite existiert", async () => {
    const supabase = fakeSupabase({ page: { data: null } });
    expect(await loadPublishedPage(supabase, "fehlt")).toBeNull();
  });

  it("wirft EditkraftSchemaError bei inkompatibler schemaVersion (anderer Major)", async () => {
    const supabase = fakeSupabase({
      page: { data: publishedPage },
      version: {
        data: {
          content: { schemaVersion: "2.0.0", blocks: [] },
          schema_version: "2.0.0",
        },
      },
    });
    await expect(loadPublishedPage(supabase, "start")).rejects.toBeInstanceOf(
      EditkraftSchemaError,
    );
  });

  it("wirft CONTENT_INVALID bei kaputtem Blocktree", async () => {
    const supabase = fakeSupabase({
      page: { data: publishedPage },
      version: { data: { content: { schemaVersion: "0.1.0", blocks: "kein array" }, schema_version: "0.1.0" } },
    });
    await expect(loadPublishedPage(supabase, "start")).rejects.toMatchObject({
      code: "CONTENT_INVALID",
    });
  });

  it("respektiert eine explizite supportedSchemaRange", async () => {
    const supabase = fakeSupabase({
      page: { data: publishedPage },
      version: { data: { content: { schemaVersion: "0.1.0", blocks: [] }, schema_version: "0.1.0" } },
    });
    await expect(
      loadPublishedPage(supabase, "start", { supportedSchemaRange: "^0.2.0" }),
    ).rejects.toBeInstanceOf(EditkraftSchemaError);
  });
});

describe("Hilfsfunktionen", () => {
  it("defaultSupportedRange akzeptiert dieselbe Major", () => {
    expect(defaultSupportedRange()).toMatch(/^>=0\.0\.0 <1\.0\.0$/);
  });
  it("pageTag ist stabil", () => {
    expect(pageTag("start")).toBe("editkraft:page:start");
  });
});
