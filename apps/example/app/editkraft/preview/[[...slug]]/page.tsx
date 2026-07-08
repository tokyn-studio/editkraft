import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { loadDraftContent } from "@editkraft/react";
import { verifyDraftToken } from "@editkraft/schema";
import { PreviewClient } from "../preview-client";

export const dynamic = "force-dynamic";

/**
 * Preview-Route: Zugriff über ein signiertes, kurzlebiges Draft-Token
 * (?token=…) statt Draft-Mode-Cookie – lädt Draft-Content serverseitig
 * (Service-Key) und übergibt ihn an die Client-Komponente EditkraftPreview,
 * die per postMessage mit dem Studio-iframe spricht.
 */
export default async function EditkraftPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const secret = process.env.EDITKRAFT_PREVIEW_SECRET;
  if (!secret || !token || !(await verifyDraftToken(token, secret))) notFound();

  const { slug } = await params;
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const page = await loadDraftContent(supabase, slug?.join("/") ?? "start");
  if (!page) notFound();
  return (
    <PreviewClient content={page.content} studioOrigin={process.env.NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN ?? ""} />
  );
}
