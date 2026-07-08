import { notFound } from "next/navigation";
import { loadPublishedPage, renderBlocks } from "@editkraft/react";
import { createPublicClient } from "@/lib/supabase";
import { registry } from "@/blocks/registry";

// Dynamisch: Content kommt zur Laufzeit aus der Kunden-Supabase.
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await loadPublishedPage(createPublicClient(), slug);
  if (!page) notFound();
  return renderBlocks(page.content.blocks, registry);
}
