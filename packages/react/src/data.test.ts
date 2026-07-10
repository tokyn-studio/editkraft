import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadPublishedPage,
  defaultSupportedRange,
  pageTag,
  getAlternateLocales,
} from "./data";
import { EditkraftSchemaError, EditkraftError } from "./errors";

/** One recorded `.eq(field, value)` call, tagged with the table it ran against. */
interface QueryLogEntry {
  table: string;
  field: string;
  value: unknown;
}

/**
 * Mini-Fake eines Supabase-Query-Builders: liefert nacheinander die für
 * ek_pages bzw. ek_page_versions hinterlegten Ergebnisse.
 *
 * `page` may be a single result (returned for every call) or an array of
 * results consumed in order (one per successive `ek_pages` query — used to
 * simulate a locale query followed by a defaultLocale fallback query, or an
 * "identify page" query followed by an "alternates" query). The optional
 * `log` array records every `.eq()` call so tests can assert which filters
 * were applied and how many queries ran.
 */
function fakeSupabase(
  results: {
    page?: { data: unknown; error?: unknown } | Array<{ data: unknown; error?: unknown }>;
    version?: { data: unknown; error?: unknown };
  },
  log: QueryLogEntry[] = [],
): SupabaseClient {
  const pageQueue = Array.isArray(results.page)
    ? [...results.page]
    : [results.page ?? { data: null }];

  const chain = (result: { data: unknown; error?: unknown }, table: string) => {
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit"]) builder[m] = () => builder;
    builder.eq = (field: string, value: unknown) => {
      log.push({ table, field, value });
      return builder;
    };
    builder.maybeSingle = async () => result ?? { data: null, error: null };
    // Real supabase-js query builders are thenable; some callers (multi-row
    // selects) `await` the query directly instead of calling `.maybeSingle()`.
    builder.then = (
      resolve: (value: { data: unknown; error?: unknown }) => void,
    ) => resolve(result ?? { data: null, error: null });
    return builder;
  };

  return {
    from(table: string) {
      if (table === "ek_pages") {
        const next =
          pageQueue.length > 1 ? pageQueue.shift()! : (pageQueue[0] ?? { data: null });
        return chain(next, table) as never;
      }
      return chain(results.version ?? { data: null }, table) as never;
    },
  } as unknown as SupabaseClient;
}

const publishedPage = {
  slug: "start",
  title: "Startseite",
  meta: {},
  status: "published",
  published_version_id: "v1",
  locale: "de",
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

  const enPage = { ...publishedPage, slug: "home", title: "Home", locale: "en" };
  const okVersion = {
    data: { content: { schemaVersion: "0.1.0", blocks: [] }, schema_version: "0.1.0" },
  };

  it("loads the requested locale", async () => {
    const log: QueryLogEntry[] = [];
    const supabase = fakeSupabase({ page: { data: enPage }, version: okVersion }, log);

    const page = await loadPublishedPage(supabase, "home", {
      locale: "en",
      defaultLocale: "de",
    });

    expect(page?.locale).toBe("en");
    expect(log).toContainEqual({ table: "ek_pages", field: "locale", value: "en" });
  });

  it("falls back to defaultLocale when the target locale has no published page", async () => {
    const log: QueryLogEntry[] = [];
    const supabase = fakeSupabase(
      { page: [{ data: null }, { data: publishedPage }], version: okVersion },
      log,
    );

    const page = await loadPublishedPage(supabase, "start", {
      locale: "en",
      defaultLocale: "de",
    });

    expect(page?.locale).toBe("de");
    expect(log.filter((e) => e.field === "locale")).toEqual([
      { table: "ek_pages", field: "locale", value: "en" },
      { table: "ek_pages", field: "locale", value: "de" },
    ]);
  });

  it("does not fall back when locale equals defaultLocale", async () => {
    const log: QueryLogEntry[] = [];
    const supabase = fakeSupabase({ page: { data: null } }, log);

    const page = await loadPublishedPage(supabase, "fehlt", {
      locale: "de",
      defaultLocale: "de",
    });

    expect(page).toBeNull();
    expect(log.filter((e) => e.field === "slug")).toHaveLength(1);
  });
});

describe("getAlternateLocales", () => {
  it("returns all published translations of the group", async () => {
    const supabase = fakeSupabase({
      page: [
        { data: { translation_group_id: "g1" } },
        {
          data: [
            { locale: "de", slug: "start" },
            { locale: "en", slug: "home" },
          ],
        },
      ],
    });

    const alternates = await getAlternateLocales(supabase, "start", "de");

    expect(alternates).toEqual([
      { locale: "de", slug: "start" },
      { locale: "en", slug: "home" },
    ]);
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
