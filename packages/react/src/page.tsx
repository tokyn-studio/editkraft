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
  /** Dev-Platzhalter für unbekannte/ungültige Blöcke (Default: NODE_ENV). */
  dev?: boolean;
  supportedSchemaRange?: string;
  /** Fallback, wenn keine published Seite existiert (statt Fehler zu werfen). */
  notFound?: ReactNode;
}

/**
 * Server Component: lädt die published Seite aus der Kunden-Supabase und rendert
 * den Blocktree über die Registry. Bei inkompatibler schemaVersion wirft der
 * Datenlader EditkraftSchemaError (klare Anleitung, kein stiller Crash).
 *
 * Verwendung (im Kundenprojekt, App Router):
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
      `Keine veröffentlichte Seite mit slug "${props.slug}" gefunden.`,
    );
  }

  return renderBlocks(page.content.blocks, props.registry, {
    ...(props.dev !== undefined ? { dev: props.dev } : {}),
  });
}
