import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pageContentSchema,
  SCHEMA_VERSION,
  isCompatible,
  majorOf,
  type PageContent,
  type PageMeta,
} from "@editkraft/schema";
import { EditkraftError, EditkraftSchemaError } from "./errors";

export interface PublishedPage {
  slug: string;
  title: string;
  meta: PageMeta;
  /** BCP-47 language tag of the loaded page. */
  locale: string;
  content: PageContent;
}

/** schemaVersion range supported by the renderer: same major as the installed schema. */
export function defaultSupportedRange(): string {
  const major = majorOf(SCHEMA_VERSION);
  return `>=${major}.0.0 <${major + 1}.0.0`;
}

export interface LoadOptions {
  /** Override for the supported schemaVersion range (default: same major). */
  supportedSchemaRange?: string;
  /**
   * BCP-47 locale to load. Without it, the lookup is NOT narrowed by locale
   * — see the "no-locale semantics" note on `loadPublishedPage` below.
   */
  locale?: string;
  /**
   * Locale to fall back to when no published page exists for `locale`. Only
   * used when both `locale` and `defaultLocale` are set and differ.
   */
  defaultLocale?: string;
}

/**
 * Draft-loading counterpart to `LoadOptions` (no `supportedSchemaRange` —
 * `loadDraftContent` doesn't schema-gate drafts). Same `locale`/
 * `defaultLocale` contract as `loadPublishedPage`, kept as a separate type
 * because the two loaders' options aren't 1:1.
 */
export interface DraftLoadOptions {
  /**
   * BCP-47 locale to load. Without it, the lookup is NOT narrowed by locale
   * — see the "no-locale semantics" note on `loadDraftContent` below.
   */
  locale?: string;
  /**
   * Locale to fall back to when no draft page exists for `locale`. Only
   * used when both `locale` and `defaultLocale` are set and differ.
   */
  defaultLocale?: string;
}

const PAGE_SELECT = "slug, title, meta, status, published_version_id, locale, translation_group_id";

/**
 * Runs the ek_pages lookup for a slug, optionally narrowed to one locale.
 *
 * No-locale semantics (bug B3 fix): once a slug can have 2+ rows (one per
 * locale — the normal state after using the translation feature), an
 * unfiltered `.eq("slug", slug).maybeSingle()` throws PostgREST's PGRST116
 * ("multiple ... rows returned") instead of picking a row. Rather than
 * silently guessing (this function has no `defaultLocale` to prefer without
 * an explicit option), rows are ordered by `locale` ascending and the first
 * is taken deterministically via `.limit(1)`. This is legacy/no-option
 * behavior only — callers on a multi-locale site SHOULD pass `locale`.
 */
function selectPageBySlug(supabase: SupabaseClient, slug: string, locale?: string) {
  let query = supabase
    .from("ek_pages")
    .select(PAGE_SELECT)
    .eq("slug", slug)
    .eq("status", "published");
  if (locale) {
    query = query.eq("locale", locale);
  } else {
    query = query.order("locale", { ascending: true }).limit(1);
  }
  return query.maybeSingle();
}

/**
 * Loads the published page together with the published version from the
 * customer's Supabase. Uses the given client (customer project); RLS only
 * allows published content to be read. Returns null if no published page
 * exists.
 *
 * With `options.locale` set, the lookup is narrowed to that locale. If no
 * published page exists for it and `options.defaultLocale` is set (and
 * differs from `options.locale`), a second query is made for the default
 * locale (Roadmap 1.4 fallback).
 *
 * Without `options.locale` (legacy callers — every pre-0.5 customer route,
 * and the CLI's scaffolded `[slug]/page.tsx`): rows are ordered by `locale`
 * ascending and the first is picked deterministically. This function cannot
 * silently prefer `defaultLocale` here — it has no way to know it without
 * the option. **Multi-locale sites should pass `options.locale` explicitly**
 * instead of relying on this fallback.
 *
 * Throws:
 *  - EditkraftSchemaError on incompatible schemaVersion (clear guidance),
 *  - EditkraftError CONTENT_INVALID on a broken block tree.
 */
export async function loadPublishedPage(
  supabase: SupabaseClient,
  slug: string,
  options: LoadOptions = {},
): Promise<PublishedPage | null> {
  let { data: page, error } = await selectPageBySlug(supabase, slug, options.locale);

  if (error) {
    throw new EditkraftError(
      "CONTENT_INVALID",
      `Error loading page "${slug}": ${error.message}`,
    );
  }

  if (
    !page &&
    options.locale &&
    options.defaultLocale &&
    options.locale !== options.defaultLocale
  ) {
    const fallback = await selectPageBySlug(supabase, slug, options.defaultLocale);
    page = fallback.data;
    error = fallback.error;
    if (error) {
      throw new EditkraftError(
        "CONTENT_INVALID",
        `Error loading page "${slug}": ${error.message}`,
      );
    }
  }

  if (!page || !page.published_version_id) return null;

  const { data: version, error: versionError } = await supabase
    .from("ek_page_versions")
    .select("content, schema_version")
    .eq("id", page.published_version_id)
    .maybeSingle();

  if (versionError || !version) return null;

  const range = options.supportedSchemaRange ?? defaultSupportedRange();
  const writtenVersion = String(version.schema_version);
  if (!isCompatible(writtenVersion, range)) {
    throw new EditkraftSchemaError(writtenVersion, range);
  }

  const parsed = pageContentSchema.safeParse(version.content);
  if (!parsed.success) {
    throw new EditkraftError(
      "CONTENT_INVALID",
      `Block tree for page "${slug}" is invalid: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join(", ")}`,
    );
  }

  return {
    slug: page.slug as string,
    title: page.title as string,
    meta: (page.meta ?? {}) as PageMeta,
    locale: page.locale as string,
    content: parsed.data,
  };
}

/** ISR cache tag for a page. The revalidate handler invalidates exactly this tag. */
export function pageTag(slug: string): string {
  return `editkraft:page:${slug}`;
}

/**
 * Returns every published translation of the page identified by `slug`
 * (narrowed to `locale` if given), for building `hreflang` alternates.
 * Pages are siblings when they share the same `translation_group_id`.
 * Returns an empty array if the page or its translation group is unknown.
 */
export async function getAlternateLocales(
  supabase: SupabaseClient,
  slug: string,
  locale?: string,
): Promise<{ locale: string; slug: string }[]> {
  // Same multi-row hazard as loadPublishedPage/loadDraftContent (bug B3):
  // 2+ locale-sibling rows share `slug`, so an unfiltered `.eq("slug",
  // slug).maybeSingle()` throws PGRST116. Order + limit(1) for the same
  // deterministic no-locale semantics — any sibling row yields the same
  // `translation_group_id` anyway, so the exact row picked doesn't matter
  // here, only that the query doesn't throw.
  let identify = supabase.from("ek_pages").select("translation_group_id").eq("slug", slug);
  if (locale) {
    identify = identify.eq("locale", locale);
  } else {
    identify = identify.order("locale", { ascending: true }).limit(1);
  }
  const { data: page, error } = await identify.maybeSingle();

  if (error || !page || !page.translation_group_id) return [];

  const { data: alternates, error: alternatesError } = await supabase
    .from("ek_pages")
    .select("locale, slug")
    .eq("translation_group_id", page.translation_group_id as string)
    .eq("status", "published");

  if (alternatesError || !alternates) return [];

  return alternates as { locale: string; slug: string }[];
}

/**
 * Returns every published page (slug, locale, last update) across all
 * locales — the raw data for building a sitemap.
 */
export async function getSitemapEntries(
  supabase: SupabaseClient,
): Promise<{ slug: string; locale: string; updated_at: string }[]> {
  const { data, error } = await supabase
    .from("ek_pages")
    .select("slug, locale, updated_at")
    .eq("status", "published");

  if (error || !data) return [];

  return data as { slug: string; locale: string; updated_at: string }[];
}

const DRAFT_PAGE_SELECT = "id, slug, title, meta, locale";

/**
 * Runs the ek_pages lookup for a draft slug, optionally narrowed to one
 * locale. Mirrors `selectPageBySlug`'s no-locale semantics (bug B3/B2 fix):
 * without `locale`, rows are ordered by `locale` ascending and the first is
 * taken deterministically, instead of letting an ambiguous multi-row match
 * throw PGRST116.
 */
function selectDraftPageBySlug(supabase: SupabaseClient, slug: string, locale?: string) {
  let query = supabase.from("ek_pages").select(DRAFT_PAGE_SELECT).eq("slug", slug);
  if (locale) {
    query = query.eq("locale", locale);
  } else {
    query = query.order("locale", { ascending: true }).limit(1);
  }
  return query.maybeSingle();
}

/**
 * Loads the DRAFT content of a page (latest version, independent of publish
 * state). For Draft Mode only — the given client MUST be a server client
 * with service_role (draft reads are blocked by RLS). Never use the
 * service key in the browser.
 *
 * With `options.locale` set, the lookup is narrowed to that locale. If no
 * draft page exists for it and `options.defaultLocale` is set (and differs
 * from `options.locale`), a second query is made for the default locale —
 * the same contract as `loadPublishedPage`.
 *
 * Bug B2 fix: without `options.locale` (the pre-0.5.2 signature had no
 * locale parameter at all), the query used to be `.eq("slug",
 * slug).maybeSingle()` with no locale filter and no `error` check. As soon
 * as a slug had 2+ locale rows — the normal state right after creating a
 * translation — PostgREST's real PGRST116 ("multiple ... rows returned")
 * was silently swallowed into a `null` result, 404-ing the customer's
 * live-preview route for *every* locale of that slug, not just the new one.
 * Now: rows are ordered by `locale` ascending and the first is picked
 * deterministically (same legacy no-locale semantics as
 * `loadPublishedPage`), and a real query error is thrown instead of
 * swallowed. **Multi-locale sites — including the CLI-scaffolded preview
 * route — should pass `options.locale` explicitly** instead of relying on
 * this fallback.
 */
export async function loadDraftContent(
  supabase: SupabaseClient,
  slug: string,
  options: DraftLoadOptions = {},
): Promise<PublishedPage | null> {
  let { data: page, error } = await selectDraftPageBySlug(supabase, slug, options.locale);

  if (error) {
    throw new EditkraftError(
      "CONTENT_INVALID",
      `Error loading draft page "${slug}": ${error.message}`,
    );
  }

  if (
    !page &&
    options.locale &&
    options.defaultLocale &&
    options.locale !== options.defaultLocale
  ) {
    const fallback = await selectDraftPageBySlug(supabase, slug, options.defaultLocale);
    page = fallback.data;
    error = fallback.error;
    if (error) {
      throw new EditkraftError(
        "CONTENT_INVALID",
        `Error loading draft page "${slug}": ${error.message}`,
      );
    }
  }

  if (!page) return null;

  const { data: version } = await supabase
    .from("ek_page_versions")
    .select("content")
    .eq("page_id", page.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return null;

  const parsed = pageContentSchema.safeParse(version.content);
  if (!parsed.success) {
    throw new EditkraftError(
      "CONTENT_INVALID",
      `Draft block tree for page "${slug}" is invalid.`,
    );
  }

  return {
    slug: page.slug as string,
    title: page.title as string,
    meta: (page.meta ?? {}) as PageMeta,
    locale: page.locale as string,
    content: parsed.data,
  };
}
