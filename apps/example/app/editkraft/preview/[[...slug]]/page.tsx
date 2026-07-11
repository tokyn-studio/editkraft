import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { loadDraftContent } from "@editkraft/react";
import { verifyDraftToken } from "@editkraft/schema";
import { PreviewClient } from "../preview-client";
import editkraftConfig from "@/editkraft.config";

export const dynamic = "force-dynamic";

/**
 * Preview-Route: Zugriff über ein signiertes, kurzlebiges Draft-Token
 * (?token=…) statt Draft-Mode-Cookie – lädt Draft-Content serverseitig
 * (Service-Key) und übergibt ihn an die Client-Komponente EditkraftPreview,
 * die per postMessage mit dem Studio-iframe spricht.
 *
 * Bug B2 fix (@editkraft/react 0.5.2): reads an optional `?locale=` search
 * param and passes it (plus this project's configured `defaultLocale`) to
 * `loadDraftContent`. Without it, the loader still resolves deterministically
 * instead of throwing once a slug has 2+ locale rows (see
 * `apps/studio/docs/mvp-verification.md` Obstacle 2 in the studio repo for
 * the original repro), but multi-locale sites should pass `locale`
 * explicitly so the correct translation's draft is shown.
 */
export default async function EditkraftPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<{ token?: string; locale?: string }>;
}) {
  const { token, locale } = await searchParams;
  const secret = process.env.EDITKRAFT_PREVIEW_SECRET;
  if (!secret || !token || !(await verifyDraftToken(token, secret))) notFound();

  const { slug } = await params;
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const page = await loadDraftContent(supabase, slug?.join("/") ?? "start", {
    ...(locale ? { locale } : {}),
    ...(editkraftConfig.defaultLocale ? { defaultLocale: editkraftConfig.defaultLocale } : {}),
  });
  if (!page) notFound();
  return (
    <PreviewClient content={page.content} studioOrigin={process.env.NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN ?? ""} />
  );
}
