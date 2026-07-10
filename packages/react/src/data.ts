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
}

/**
 * Loads the published page together with the published version from the
 * customer's Supabase. Uses the given client (customer project); RLS only
 * allows published content to be read. Returns null if no published page
 * exists.
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
  const { data: page, error } = await supabase
    .from("ek_pages")
    .select("slug, title, meta, status, published_version_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throw new EditkraftError(
      "CONTENT_INVALID",
      `Error loading page "${slug}": ${error.message}`,
    );
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
    content: parsed.data,
  };
}

/** ISR cache tag for a page. The revalidate handler invalidates exactly this tag. */
export function pageTag(slug: string): string {
  return `editkraft:page:${slug}`;
}

/**
 * Loads the DRAFT content of a page (latest version, independent of publish
 * state). For Draft Mode only — the given client MUST be a server client
 * with service_role (draft reads are blocked by RLS). Never use the
 * service key in the browser.
 */
export async function loadDraftContent(
  supabase: SupabaseClient,
  slug: string,
): Promise<PublishedPage | null> {
  const { data: page } = await supabase
    .from("ek_pages")
    .select("id, slug, title, meta")
    .eq("slug", slug)
    .maybeSingle();
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
    content: parsed.data,
  };
}
