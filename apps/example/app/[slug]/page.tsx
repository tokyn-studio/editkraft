import { notFound } from "next/navigation";
import { loadPublishedPage, renderBlocks } from "@editkraft/react";
import { createPublicClient } from "@/lib/supabase";
import { registry } from "@/blocks/registry";
import editkraftConfig from "@/editkraft.config";

// Dynamisch: Content kommt zur Laufzeit aus der Kunden-Supabase.
export const dynamic = "force-dynamic";

// Task 7 (Roadmap 1.4 E2E proof): minimal customer-side locale wiring via
// ?locale= query param, using the EditkraftPage-equivalent locale/defaultLocale
// contract already shipped in @editkraft/react 0.5.x loadPublishedPage(). Task 6
// deliberately left this unwired ("localized E2E proof comes in Phase 2 with the
// Studio") — this is that proof, added as a real customer would integrate it.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { slug } = await params;
  const { locale } = await searchParams;
  const page = await loadPublishedPage(createPublicClient(), slug, {
    ...(locale ? { locale } : {}),
    ...(editkraftConfig.defaultLocale ? { defaultLocale: editkraftConfig.defaultLocale } : {}),
  });
  if (!page) notFound();
  return renderBlocks(page.content.blocks, registry);
}
