import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EditkraftError } from "./errors";
import { loadPublishedPage } from "./data";
import { renderBlocks } from "./render";
import type { Registry } from "./registry";

export interface EditkraftPageProps {
  supabase: SupabaseClient;
  slug: string;
  registry: Registry;
  /** Dev placeholder for unknown/invalid blocks (default: NODE_ENV). */
  dev?: boolean;
  supportedSchemaRange?: string;
  /** Fallback used when no published page exists (instead of throwing). */
  notFound?: ReactNode;
}

/**
 * Server Component: loads the published page from the customer's Supabase and
 * renders the block tree via the registry. On an incompatible schemaVersion,
 * the data loader throws EditkraftSchemaError (clear guidance, no silent crash).
 *
 * Usage (in the customer project, App Router):
 *   export default async function Page({ params }) {
 *     const supabase = createServerClient(...)
 *     return <EditkraftPage supabase={supabase} slug={(await params).slug} registry={registry} />
 *   }
 */
export async function EditkraftPage(props: EditkraftPageProps): Promise<ReactNode> {
  const page = await loadPublishedPage(props.supabase, props.slug, {
    ...(props.supportedSchemaRange ? { supportedSchemaRange: props.supportedSchemaRange } : {}),
  });

  if (!page) {
    if (props.notFound !== undefined) return props.notFound;
    throw new EditkraftError(
      "PAGE_NOT_FOUND",
      `No published page found for slug "${props.slug}".`,
    );
  }

  return renderBlocks(page.content.blocks, props.registry, {
    ...(props.dev !== undefined ? { dev: props.dev } : {}),
  });
}
