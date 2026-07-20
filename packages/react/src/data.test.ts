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
  getCollection,
  getCollectionItem,
  pageTag,
  globalsTag,
  getAlternateLocales,
} from "./data";
import { EditkraftSchemaError, EditkraftError } from "./errors";

/**
 * next/cache im Test als Pass-Through: ruft die gecachte Funktion direkt auf
 * (kein echtes Caching, alle bestehenden Reads verhalten sich unverändert),
 * zeichnet aber keyParts/tags auf — damit prüfbar ist, dass die Reads an den
 * richtigen ISR-Tag gebunden werden.
 */
const { cacheCalls } = vi.hoisted(() => ({
  cacheCalls: [] as { keyParts: unknown[]; tags: string[] | undefined }[],
}));
vi.mock("next/cache", () => ({
  unstable_cache:
    (
      fn: (...a: unknown[]) => unknown,
      keyParts: unknown[],
      options?: { tags?: string[] },
    ) =>
    (...args: unknown[]) => {
      cacheCalls.push({ keyParts, tags: options?.tags });
      return fn(...args);
    },
  revalidateTag: () => {},
}));

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

  it("bindet den Read an pageTag(slug) (ISR-Revalidierung)", async () => {
    cacheCalls.length = 0;
    const supabase = fakeSupabase({ page: { data: null } });
    await loadPublishedPage(supabase, "home", { locale: "de" });
    const call = cacheCalls.find(
      (c) => Array.isArray(c.keyParts) && c.keyParts[0] === "editkraft:page",
    );
    expect(call?.tags).toEqual([pageTag("home")]);
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

/**
 * Fake für die Collections-Tabellen, im Stil von `fakeSupabaseTable`, aber mit
 * den zusätzlich benötigten Query-Features: `.not("col", "is", null)`
 * (published-only-Filter) und MULTI-KEY-Ordering inkl. `nullsFirst` — mehrere
 * `.order()`-Aufrufe wirken wie bei PostgREST als ein zusammengesetzter
 * Sortierschlüssel (nicht als sequentielle Re-Sorts), deshalb werden die
 * Orderings gesammelt und erst bei der Materialisierung angewendet.
 */
function fakeCollectionsDb(tables: Record<string, Record<string, unknown>[]>): SupabaseClient {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let limitN: number | null = null;
      const orderings: { field: string; dir: 1 | -1; nullsFirst: boolean }[] = [];
      const builder: Record<string, unknown> = {};

      const materialize = () => {
        let out = [...rows];
        if (orderings.length > 0) {
          out.sort((a, b) => {
            for (const o of orderings) {
              const av = a[o.field];
              const bv = b[o.field];
              if (av === bv) continue;
              if (av == null) return o.nullsFirst ? -1 : 1;
              if (bv == null) return o.nullsFirst ? 1 : -1;
              return ((av as never) > (bv as never) ? 1 : -1) * o.dir;
            }
            return 0;
          });
        }
        if (limitN !== null) out = out.slice(0, limitN);
        return out;
      };

      builder.select = () => builder;
      builder.eq = (field: string, value: unknown) => {
        rows = rows.filter((r) => r[field] === value);
        return builder;
      };
      builder.not = (field: string, op: string, value: unknown) => {
        if (op === "is" && value === null) rows = rows.filter((r) => r[field] != null);
        return builder;
      };
      builder.order = (field: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => {
        const dir: 1 | -1 = opts?.ascending === false ? -1 : 1;
        // Postgres-Default: NULLs gelten als größte Werte (asc → last, desc → first).
        orderings.push({ field, dir, nullsFirst: opts?.nullsFirst ?? dir === -1 });
        return builder;
      };
      builder.limit = (n: number) => {
        limitN = n;
        return builder;
      };
      builder.maybeSingle = async () => {
        const out = materialize();
        if (out.length > 1) {
          return {
            data: null,
            error: {
              code: "PGRST116",
              message: "JSON object requested, multiple (or no) rows returned",
            },
          };
        }
        return { data: out[0] ?? null, error: null };
      };
      builder.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
        resolve({ data: materialize(), error: null });
      return builder as never;
    },
  } as unknown as SupabaseClient;
}

const blogCollection = { id: "c1", slug: "blog", name: "Blog" };
const blogItems = [
  {
    id: "i1",
    collection_id: "c1",
    slug: "hello-world",
    locale: "de",
    draft_data: { title: "Hallo (Draft)", body: "<p>Draft</p>" },
    published_data: { title: "Hallo Welt", body: "<p>Publiziert</p>" },
    published_at: "2026-07-01T00:00:00Z",
    sort_order: null,
  },
  {
    id: "i2",
    collection_id: "c1",
    slug: "second-post",
    locale: "de",
    draft_data: { title: "Zweiter (Draft)" },
    published_data: { title: "Zweiter Beitrag", body: "<p>Zwei</p>" },
    published_at: "2026-07-05T00:00:00Z",
    sort_order: null,
  },
  {
    // Draft-only: published_data ist null → darf NIE auftauchen.
    id: "i3",
    collection_id: "c1",
    slug: "draft-only",
    locale: "de",
    draft_data: { title: "Unveröffentlicht" },
    published_data: null,
    published_at: null,
    sort_order: null,
  },
  {
    // Manuell einsortiert: sort_order schlägt published_at.
    id: "i4",
    collection_id: "c1",
    slug: "pinned",
    locale: "de",
    draft_data: { title: "Pinned (Draft)" },
    published_data: { title: "Angepinnt", body: "<p>Pin</p>" },
    published_at: "2026-06-01T00:00:00Z",
    sort_order: 1,
  },
  {
    // Übersetzung: gleiche Collection, andere Locale.
    id: "i5",
    collection_id: "c1",
    slug: "hello-world-en",
    locale: "en",
    draft_data: { title: "Hello (Draft)" },
    published_data: { title: "Hello World", body: "<p>Published</p>" },
    published_at: "2026-07-02T00:00:00Z",
    sort_order: null,
  },
];

describe("getCollection", () => {
  it("liefert nur published Items in der Spec-Form {id, slug, locale, data, publishedAt, sortOrder}", async () => {
    const supabase = fakeCollectionsDb({
      ek_collections: [blogCollection],
      ek_collection_items: blogItems,
    });

    const items = await getCollection(supabase, "blog", { locale: "de" });

    expect(items.map((i) => i.slug)).not.toContain("draft-only");
    expect(items.find((i) => i.slug === "hello-world")).toEqual({
      id: "i1",
      slug: "hello-world",
      locale: "de",
      data: { title: "Hallo Welt", body: "<p>Publiziert</p>" },
      publishedAt: "2026-07-01T00:00:00Z",
      sortOrder: null,
    });
    // data ist der published-Snapshot, nie draft_data.
    expect(items.some((i) => JSON.stringify(i.data).includes("Draft"))).toBe(false);
  });

  it("sortiert default sort_order nulls last, dann published_at desc", async () => {
    const supabase = fakeCollectionsDb({
      ek_collections: [blogCollection],
      ek_collection_items: blogItems,
    });

    const items = await getCollection(supabase, "blog", { locale: "de" });

    expect(items.map((i) => i.slug)).toEqual(["pinned", "second-post", "hello-world"]);
  });

  it("respektiert limit und eine explizite order-Option", async () => {
    const supabase = fakeCollectionsDb({
      ek_collections: [blogCollection],
      ek_collection_items: blogItems,
    });

    const items = await getCollection(supabase, "blog", {
      locale: "de",
      order: { column: "published_at", ascending: true },
      limit: 2,
    });

    expect(items.map((i) => i.slug)).toEqual(["pinned", "hello-world"]);
  });

  it("filtert auf die angefragte Locale", async () => {
    const supabase = fakeCollectionsDb({
      ek_collections: [blogCollection],
      ek_collection_items: blogItems,
    });

    const items = await getCollection(supabase, "blog", { locale: "en" });

    expect(items.map((i) => i.slug)).toEqual(["hello-world-en"]);
  });

  it("fällt auf defaultLocale zurück, wenn die Ziel-Locale keine published Items hat", async () => {
    const supabase = fakeCollectionsDb({
      ek_collections: [blogCollection],
      ek_collection_items: blogItems,
    });

    const items = await getCollection(supabase, "blog", {
      locale: "fr",
      defaultLocale: "de",
    });

    expect(items).toHaveLength(3);
    expect(items.every((i) => i.locale === "de")).toBe(true);
  });

  it("gibt [] für eine unbekannte Collection zurück", async () => {
    const supabase = fakeCollectionsDb({
      ek_collections: [blogCollection],
      ek_collection_items: blogItems,
    });
    expect(await getCollection(supabase, "gibt-es-nicht")).toEqual([]);
  });
});

describe("getCollectionItem", () => {
  const db = () =>
    fakeCollectionsDb({
      ek_collections: [blogCollection],
      ek_collection_items: blogItems,
    });

  it("liefert das published Item", async () => {
    const item = await getCollectionItem(db(), "blog", "hello-world", { locale: "de" });
    expect(item).toEqual({
      id: "i1",
      slug: "hello-world",
      locale: "de",
      data: { title: "Hallo Welt", body: "<p>Publiziert</p>" },
      publishedAt: "2026-07-01T00:00:00Z",
      sortOrder: null,
    });
  });

  it("gibt null für ein nie publiziertes Item zurück (published-only)", async () => {
    expect(await getCollectionItem(db(), "blog", "draft-only", { locale: "de" })).toBeNull();
  });

  it("gibt null für unbekannte Collection oder unbekannten Item-Slug zurück", async () => {
    expect(await getCollectionItem(db(), "nope", "hello-world")).toBeNull();
    expect(await getCollectionItem(db(), "blog", "nope", { locale: "de" })).toBeNull();
  });

  it("fällt auf defaultLocale zurück, wenn die Ziel-Locale das Item nicht published hat", async () => {
    const item = await getCollectionItem(db(), "blog", "hello-world", {
      locale: "en",
      defaultLocale: "de",
    });
    expect(item?.locale).toBe("de");
    expect(item?.data.title).toBe("Hallo Welt");
  });

  it("ohne locale: deterministische Wahl (locale aufsteigend) statt PGRST116 bei Locale-Geschwistern", async () => {
    const siblings = [
      { ...blogItems[0]!, id: "s1", slug: "same", locale: "de" },
      { ...blogItems[0]!, id: "s2", slug: "same", locale: "en" },
    ];
    const supabase = fakeCollectionsDb({
      ek_collections: [blogCollection],
      ek_collection_items: siblings,
    });

    const item = await getCollectionItem(supabase, "blog", "same");

    expect(item?.locale).toBe("de");
  });

  it("propagiert einen echten Query-Fehler als EditkraftError", async () => {
    const supabase: SupabaseClient = {
      from(table: string) {
        const builder: Record<string, unknown> = {};
        for (const m of ["select", "order", "limit", "not"]) builder[m] = () => builder;
        builder.eq = () => builder;
        builder.maybeSingle = async () =>
          table === "ek_collections"
            ? { data: null, error: { code: "PGRST301", message: "boom" } }
            : { data: null, error: null };
        return builder as never;
      },
    } as unknown as SupabaseClient;

    await expect(getCollectionItem(supabase, "blog", "x")).rejects.toMatchObject({
      code: "CONTENT_INVALID",
    });
    await expect(getCollection(supabase, "blog")).rejects.toMatchObject({
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

  it("bindet loadGlobals an globalsTag() (ISR-Revalidierung)", async () => {
    cacheCalls.length = 0;
    const supabase = fakeGlobalsSupabase({ data: { published: { phone: "1" } } });
    await loadGlobals(supabase, definition);
    const call = cacheCalls.find(
      (c) => Array.isArray(c.keyParts) && c.keyParts[0] === "editkraft:globals",
    );
    expect(call?.tags).toEqual([globalsTag()]);
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
