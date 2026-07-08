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

/** Vom Renderer unterstützte schemaVersion-Range: gleiche Major wie das installierte Schema. */
export function defaultSupportedRange(): string {
  const major = majorOf(SCHEMA_VERSION);
  return `>=${major}.0.0 <${major + 1}.0.0`;
}

export interface LoadOptions {
  /** Override der unterstützten schemaVersion-Range (Default: gleiche Major). */
  supportedSchemaRange?: string;
}

/**
 * Lädt die published Seite samt published Version aus der Kunden-Supabase.
 * Nutzt den übergebenen Client (Kundenprojekt); über RLS ist nur published
 * Content lesbar. Gibt null zurück, wenn keine published Seite existiert.
 *
 * Wirft:
 *  - EditkraftSchemaError bei inkompatibler schemaVersion (klare Anleitung),
 *  - EditkraftError CONTENT_INVALID bei kaputtem Blocktree.
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
      `Fehler beim Laden der Seite "${slug}": ${error.message}`,
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
      `Blocktree der Seite "${slug}" ist ungültig: ${parsed.error.issues
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

/** ISR-Cache-Tag einer Seite. Der Revalidate-Handler invalidiert genau diesen Tag. */
export function pageTag(slug: string): string {
  return `editkraft:page:${slug}`;
}

/**
 * Lädt den DRAFT-Content einer Seite (neueste Version, unabhängig vom Publish).
 * Nur für den Draft Mode – der übergebene Client MUSS ein Server-Client mit
 * service_role sein (Draft-Reads sind über RLS gesperrt). Niemals im Browser
 * mit Service-Key verwenden.
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
      `Draft-Blocktree der Seite "${slug}" ist ungültig.`,
    );
  }

  return {
    slug: page.slug as string,
    title: page.title as string,
    meta: (page.meta ?? {}) as PageMeta,
    content: parsed.data,
  };
}
