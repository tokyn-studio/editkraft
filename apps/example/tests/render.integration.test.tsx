import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { loadPublishedPage, renderBlocks } from "@editkraft/react";
import { registry } from "../blocks/registry";

/**
 * Integrationsbeweis (DoD M3): Eine Seite mit ZWEI Blöcken wird aus einer lokalen
 * Supabase geladen (über den Anon-Client, RLS greift) und über die Registry zu
 * HTML gerendert. Setzt voraus, dass die ek_-Migration angewandt ist.
 *
 * Keys kommen aus der ENV (keine Secrets im Repo). Lokal z. B. mit den Werten
 * aus `supabase status` starten:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @editkraft/example test:integration
 * Ohne gesetzte Keys wird der Test übersprungen.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(ANON_KEY && SERVICE_KEY);

const SLUG = `it-page-${Date.now()}`;
let admin: SupabaseClient;
let anon: SupabaseClient;
let pageId: string;

beforeAll(async () => {
  if (!canRun) return;
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  anon = createClient(SUPABASE_URL, ANON_KEY!, { auth: { persistSession: false } });

  const { data: page, error } = await admin
    .from("ek_pages")
    .insert({ slug: SLUG, title: "Integration", status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(`Seed fehlgeschlagen (Migration angewandt?): ${error.message}`);
  pageId = page!.id;

  const content = {
    schemaVersion: "0.1.0",
    blocks: [
      { id: "b1", type: "Hero", props: {
        headline: "Willkommen bei Editkraft",
        body: "<b>Zwei</b> Blöcke",
        image: { assetId: "", url: "" },
      } },
    ],
  };
  const { data: version } = await admin
    .from("ek_page_versions")
    .insert({ page_id: pageId, content, schema_version: "0.1.0" })
    .select("id")
    .single();

  await admin
    .from("ek_pages")
    .update({ status: "published", published_version_id: version!.id })
    .eq("id", pageId);
});

afterAll(async () => {
  if (pageId) await admin.from("ek_pages").delete().eq("id", pageId);
});

describe.skipIf(!canRun)("Renderer-Integration", () => {
  it("rendert eine Seite mit zwei Blöcken aus der lokalen Supabase (Anon/RLS)", async () => {
    const page = await loadPublishedPage(anon, SLUG);
    expect(page).not.toBeNull();
    expect(page!.content.blocks).toHaveLength(1);

    const html = renderToStaticMarkup(renderBlocks(page!.content.blocks, registry));
    expect(html).toContain("Willkommen bei Editkraft");
    expect(html).toContain('data-ek-field="headline"');
    expect(html).toContain("<strong>Zwei</strong>");
  });

  it("Anon sieht Draft-Seiten NICHT (RLS)", async () => {
    const draftSlug = `it-draft-${Date.now()}`;
    const { data: draft } = await admin
      .from("ek_pages")
      .insert({ slug: draftSlug, title: "Draft", status: "draft" })
      .select("id")
      .single();
    try {
      expect(await loadPublishedPage(anon, draftSlug)).toBeNull();
    } finally {
      await admin.from("ek_pages").delete().eq("id", draft!.id);
    }
  });
});
