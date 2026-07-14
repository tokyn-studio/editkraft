import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { defineGlobals, ekText } from "@editkraft/schema";
import {
  loadPublishedPage,
  loadDraftContent,
  loadGlobals,
  loadDraftGlobals,
  defaultSupportedRange,
  pageTag,
  globalsTag,
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

/**
 * Realistic fake that mirrors actual PostgREST semantics for multi-row
 * tables: `.eq()`/`.order()`/`.limit()` are applied to an in-memory row
 * array, then `.maybeSingle()` throws the real PGRST116 shape
 * (`{code: "PGRST116", message: "JSON object requested, multiple (or no)
 * rows returned"}`) when more than one row remains — exactly what a real
 * Supabase project does once a slug has 2+ locale rows (Roadmap 1.4) and the
 * query doesn't narrow to exactly one row first. `.then()` resolves the
 * (filtered/ordered/limited) row array directly for callers that await a
 * multi-row select without `.maybeSingle()`.
 *
 * Unlike `fakeSupabase` above (which returns a pre-canned result regardless
 * of which chain methods were called), this fake actually *evaluates* the
 * query, so it can tell the difference between "no locale filter, no
 * order/limit" (today's B2/B3 bug: ambiguous multi-row match) and "no locale
 * filter, but ordered + limited to 1" (the fix: deterministic first row).
 */
function fakeSupabaseTable(tables: Record<string, Record<string, unknown>[]>): SupabaseClient {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      // Column projection is applied only when the response is materialized
      // (maybeSingle/then), not at `.select()` time — later `.eq()`/`.order()`
      // calls (e.g. filtering by a column not in the select list) must still
      // see the full row, exactly like real PostgREST evaluates filters
      // server-side independent of the response's field list.
      let columns: string[] | null = null;
      const project = (r: Record<string, unknown>) =>
        columns ? Object.fromEntries(columns.map((f) => [f, r[f]])) : r;
      const builder: Record<string, unknown> = {};
      builder.select = (cols?: string) => {
        if (cols) columns = cols.split(",").map((c) => c.trim());
        return builder;
      };
      builder.eq = (field: string, value: unknown) => {
        rows = rows.filter((r) => r[field] === value);
        return builder;
      };
      builder.order = (field: string, opts?: { ascending?: boolean }) => {
        const dir = opts?.ascending === false ? -1 : 1;
        rows = [...rows].sort((a, b) => {
          const av = a[field];
          const bv = b[field];
          if (av === bv) return 0;
          return (av as string) > (bv as string) ? dir : -dir;
        });
        return builder;
      };
      builder.limit = (n: number) => {
        rows = rows.slice(0, n);
        return builder;
      };
      builder.maybeSingle = async () => {
        if (rows.length > 1) {
          return {
            data: null,
            error: {
              code: "PGRST116",
              message: "JSON object requested, multiple (or no) rows returned",
            },
          };
        }
        return { data: rows[0] ? project(rows[0]) : null, error: null };
      };
      builder.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
        resolve({ data: rows.map(project), error: null });
      return builder as never;
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

  // Bug B3 (consistency check): the "identify the page" query used
  // `.eq("slug", slug)` with no locale narrowing when `locale` is omitted —
  // the exact same multi-row hazard as loadPublishedPage/loadDraftContent.
  // Two locale-siblings sharing one slug (the normal Roadmap 1.4 state) made
  // `.maybeSingle()` throw PGRST116 instead of returning the group id.
  it("does not throw when 2+ locale rows share a slug and no locale is given (multi-row hazard)", async () => {
    const supabase = fakeSupabaseTable({
      ek_pages: [
        { slug: "home", locale: "de", translation_group_id: "g1", status: "published" },
        { slug: "home", locale: "en", translation_group_id: "g1", status: "published" },
      ],
    });

    const alternates = await getAlternateLocales(supabase, "home");

    // Deterministic pick (locale ascending, same legacy semantics as
    // loadPublishedPage) still resolves the same translation_group_id here
    // since both sibling rows share it — the point is it must not throw.
    expect(alternates).toEqual([
      { locale: "de", slug: "home" },
      { locale: "en", slug: "home" },
    ]);
  });
});

describe("loadPublishedPage — multi-locale (bug B3)", () => {
  const multiLocalePages = [
    {
      slug: "home",
      title: "Home DE",
      meta: {},
      status: "published",
      published_version_id: "v-de",
      locale: "de",
    },
    {
      slug: "home",
      title: "Home EN",
      meta: {},
      status: "published",
      published_version_id: "v-en",
      locale: "en",
    },
  ];
  const versionRows = [
    {
      id: "v-de",
      content: { schemaVersion: "0.1.0", blocks: [] },
      schema_version: "0.1.0",
    },
    {
      id: "v-en",
      content: { schemaVersion: "0.1.0", blocks: [] },
      schema_version: "0.1.0",
    },
  ];

  // Reproduces mvp-verification.md Obstacle 3: any legacy caller that omits
  // `options.locale` (every pre-0.5 customer route, and the CLI's scaffolded
  // `[slug]/page.tsx`) 500s the instant a slug has 2+ published locale rows
  // — the normal outcome of using the translation feature. Before the fix,
  // `selectPageBySlug` ran `.eq("slug", slug).eq("status", "published")`
  // straight into `.maybeSingle()` with no order/limit, so PostgREST's real
  // PGRST116 ("multiple ... rows returned") surfaced as a thrown
  // EditkraftError instead of a picked row. The fix orders by `locale`
  // ascending and takes the first row deterministically.
  it("without options.locale, resolves deterministically to the alphabetically-first locale instead of throwing", async () => {
    const supabase = fakeSupabaseTable({
      ek_pages: multiLocalePages,
      ek_page_versions: versionRows,
    });

    const page = await loadPublishedPage(supabase, "home");

    expect(page?.locale).toBe("de");
    expect(page?.title).toBe("Home DE");
  });

  it("with options.locale set, the multi-row query is filtered to exactly that locale", async () => {
    const supabase = fakeSupabaseTable({
      ek_pages: multiLocalePages,
      ek_page_versions: versionRows,
    });

    const page = await loadPublishedPage(supabase, "home", { locale: "en" });

    expect(page?.locale).toBe("en");
    expect(page?.title).toBe("Home EN");
  });
});

describe("loadDraftContent", () => {
  const draftPage = {
    id: "p1",
    slug: "start",
    title: "Startseite (Draft)",
    meta: {},
    locale: "de",
  };
  const draftVersion = {
    page_id: "p1",
    created_at: "2026-01-01T00:00:00Z",
    content: { schemaVersion: "0.1.0", blocks: [{ id: "a", type: "Heading", props: {} }] },
  };

  it("loads the draft version for a page", async () => {
    const supabase = fakeSupabaseTable({
      ek_pages: [draftPage],
      ek_page_versions: [draftVersion],
    });

    const page = await loadDraftContent(supabase, "start");

    expect(page?.title).toBe("Startseite (Draft)");
    expect(page?.content.blocks).toHaveLength(1);
  });

  it("returns null when no draft page exists", async () => {
    const supabase = fakeSupabaseTable({ ek_pages: [], ek_page_versions: [] });
    expect(await loadDraftContent(supabase, "fehlt")).toBeNull();
  });

  it("throws CONTENT_INVALID on a broken draft block tree", async () => {
    const supabase = fakeSupabaseTable({
      ek_pages: [draftPage],
      ek_page_versions: [{ ...draftVersion, content: { schemaVersion: "0.1.0", blocks: "kein array" } }],
    });
    await expect(loadDraftContent(supabase, "start")).rejects.toMatchObject({
      code: "CONTENT_INVALID",
    });
  });

  // Bug B2 (the headline finding): with no locale filter at all,
  // `.eq("slug", slug).maybeSingle()` throws PGRST116 as soon as any two
  // locales share a slug — which is exactly the state Roadmap 1.4 (the
  // translation feature) produces. Confirmed against real PostgREST in
  // mvp-verification.md Obstacle 2: the customer's live-preview route 404s
  // for *every* locale of that slug, not just the new one, and the error was
  // silently swallowed (no `error` check) so there was no diagnostic either.
  const multiLocaleDraftPages = [
    { id: "p-de", slug: "home", title: "Home DE (Draft)", meta: {}, locale: "de" },
    { id: "p-en", slug: "home", title: "Home EN (Draft)", meta: {}, locale: "en" },
  ];
  const multiLocaleDraftVersions = [
    {
      page_id: "p-de",
      created_at: "2026-01-01T00:00:00Z",
      content: { schemaVersion: "0.1.0", blocks: [] },
    },
    {
      page_id: "p-en",
      created_at: "2026-01-02T00:00:00Z",
      content: { schemaVersion: "0.1.0", blocks: [] },
    },
  ];

  it("without options.locale, resolves deterministically instead of throwing when 2+ locales share a slug", async () => {
    const supabase = fakeSupabaseTable({
      ek_pages: multiLocaleDraftPages,
      ek_page_versions: multiLocaleDraftVersions,
    });

    const page = await loadDraftContent(supabase, "home");

    expect(page?.locale).toBe("de");
    expect(page?.title).toBe("Home DE (Draft)");
  });

  it("with options.locale set, loads exactly that locale's draft", async () => {
    const supabase = fakeSupabaseTable({
      ek_pages: multiLocaleDraftPages,
      ek_page_versions: multiLocaleDraftVersions,
    });

    const page = await loadDraftContent(supabase, "home", { locale: "en" });

    expect(page?.locale).toBe("en");
    expect(page?.title).toBe("Home EN (Draft)");
  });

  it("falls back to defaultLocale when no draft exists for the requested locale", async () => {
    const supabase = fakeSupabaseTable({
      ek_pages: multiLocaleDraftPages,
      ek_page_versions: multiLocaleDraftVersions,
    });

    const page = await loadDraftContent(supabase, "home", {
      locale: "fr",
      defaultLocale: "de",
    });

    expect(page?.locale).toBe("de");
  });

  it("propagates a real query error instead of silently swallowing it", async () => {
    const supabase: SupabaseClient = {
      from(table: string) {
        const builder: Record<string, unknown> = {};
        for (const m of ["select", "order", "limit"]) builder[m] = () => builder;
        builder.eq = () => builder;
        builder.maybeSingle = async () =>
          table === "ek_pages"
            ? { data: null, error: { code: "PGRST116", message: "boom" } }
            : { data: null, error: null };
        return builder as never;
      },
    } as unknown as SupabaseClient;

    await expect(loadDraftContent(supabase, "start")).rejects.toMatchObject({
      code: "CONTENT_INVALID",
    });
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

describe("Site-Globals-Loader", () => {
  const definition = defineGlobals({
    schema: z.object({ phone: ekText({ label: "Telefon" }) }),
  });

  /** Mini-Fake für ek_globals: zeichnet select()-Spalten auf. */
  function fakeGlobalsSupabase(
    result: { data: unknown; error?: unknown },
    selects: string[] = [],
  ): SupabaseClient {
    const builder: Record<string, unknown> = {};
    builder.select = (cols: string) => {
      selects.push(cols);
      return builder;
    };
    builder.eq = () => builder;
    builder.maybeSingle = async () => result;
    return { from: () => builder } as unknown as SupabaseClient;
  }

  it("globalsTag ist der site-weite Tag", () => {
    expect(globalsTag()).toBe("editkraft:globals");
  });

  it("loadGlobals liest NUR die published-Spalte (Spalten-GRANT) und liefert die Werte", async () => {
    const selects: string[] = [];
    const supabase = fakeGlobalsSupabase({ data: { published: { phone: "0176 1" } } }, selects);
    const values = await loadGlobals(supabase, definition);
    expect(values).toEqual({ phone: "0176 1" });
    expect(selects).toEqual(["published"]);
  });

  it("loadGlobals → null bei fehlender Tabelle (Site ohne Globals-Migration), ohne zu werfen", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const supabase = fakeGlobalsSupabase({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.ek_globals'" },
    });
    await expect(loadGlobals(supabase, definition)).resolves.toBeNull();
    warn.mockRestore();
  });

  it("loadGlobals → null bei unveröffentlichten oder schema-invaliden Werten", async () => {
    expect(
      await loadGlobals(fakeGlobalsSupabase({ data: { published: null } }), definition),
    ).toBeNull();
    expect(
      await loadGlobals(fakeGlobalsSupabase({ data: { published: { phone: 42 } } }), definition),
    ).toBeNull();
  });

  it("loadDraftGlobals liest draft ?? published", async () => {
    const selects: string[] = [];
    expect(
      await loadDraftGlobals(
        fakeGlobalsSupabase(
          { data: { draft: { phone: "draft" }, published: { phone: "pub" } } },
          selects,
        ),
        definition,
      ),
    ).toEqual({ phone: "draft" });
    expect(selects).toEqual(["draft, published"]);
    expect(
      await loadDraftGlobals(
        fakeGlobalsSupabase({ data: { draft: null, published: { phone: "pub" } } }),
        definition,
      ),
    ).toEqual({ phone: "pub" });
  });
});
