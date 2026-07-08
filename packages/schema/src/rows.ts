import { z } from "zod";
import { pageContentSchema } from "./block";

/**
 * Zod-Schemas der Kunden-DB-Rows (Tabellen mit Prefix `ek_`).
 * Der Renderer validiert damit, was aus der Kunden-Supabase kommt; das CLI legt
 * die passenden SQL-Migrationen an (Meilenstein 2).
 */

export const pageStatusSchema = z.enum(["draft", "published"]);
export type PageStatus = z.infer<typeof pageStatusSchema>;

/** SEO-/Meta-Feld von ek_pages. Bewusst offen, aber getippt für gängige Felder. */
export const pageMetaSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    noindex: z.boolean().optional(),
  })
  .passthrough();
export type PageMeta = z.infer<typeof pageMetaSchema>;

export const ekPageRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  meta: pageMetaSchema.default({}),
  status: pageStatusSchema,
  published_version_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type EkPageRow = z.infer<typeof ekPageRowSchema>;

export const ekPageVersionRowSchema = z.object({
  id: z.string().uuid(),
  page_id: z.string().uuid(),
  content: pageContentSchema,
  schema_version: z.string(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type EkPageVersionRow = z.infer<typeof ekPageVersionRowSchema>;

export const ekAssetRowSchema = z.object({
  id: z.string().uuid(),
  storage_path: z.string(),
  alt: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  mime_type: z.string(),
});
export type EkAssetRow = z.infer<typeof ekAssetRowSchema>;

/** Storage-Bucket, in dem das CLI Assets ablegt. */
export const EK_ASSETS_BUCKET = "ek-assets";
