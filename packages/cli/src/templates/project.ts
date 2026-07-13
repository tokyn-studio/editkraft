/**
 * Scaffold files that `editkraft init` writes into the customer project.
 * All templates are pure functions (snapshot-testable).
 *
 * The renderer imports (`@editkraft/react`) work once the package is
 * installed (Milestone 3). init only scaffolds — it doesn't install.
 */

/** Default locale scaffolded into new projects (config template + i18n migration). */
export const DEFAULT_LOCALE = "de";

export function editkraftConfig(): string {
  return `import type { EditkraftConfig } from "@editkraft/react";

/**
 * Editkraft configuration for your project.
 * The allowed Studio origin comes from ENV (no hardcoding secrets).
 */
export default {
  // Path to the block registry (see blocks/registry.ts)
  registry: "./blocks/registry",
  // Allowed Studio origin for the preview bridge (postMessage origin check)
  studioOrigin: process.env.NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN ?? "",
  /** BCP-47 locales this site publishes. First entry pages are created in by default. */
  locales: ["${DEFAULT_LOCALE}"],
  defaultLocale: "${DEFAULT_LOCALE}",
} satisfies EditkraftConfig;
`;
}

export function registryTs(): string {
  return `import { createRegistry } from "@editkraft/react";
import { defineBlock, ekText, ekImage, ekLink } from "@editkraft/schema";
import { z } from "zod";
import { Hero } from "./Hero";

/**
 * Block registry: pairs each block definition with its React component.
 * createRegistry validates that every type has both a definition AND a component.
 */
export const registry = createRegistry([
  {
    definition: defineBlock({
      type: "Hero",
      label: "Hero section",
      schema: z.object({
        headline: ekText({ label: "Headline" }),
        image: ekImage({ label: "Image" }),
        cta: ekLink({ label: "Button" }).optional(),
      }),
    }),
    component: Hero,
  },
]);
`;
}

export function heroComponent(): string {
  return `import type { EkImageValue, EkLinkValue } from "@editkraft/schema";

/**
 * Example block. Adjust markup and styling to your design — props come
 * validated from the block definition in blocks/registry.ts.
 *
 * IMPORTANT: \`data-ek-field="<propName>"\` binds an element to its schema
 * field. The Studio edits EXCLUSIVELY inline in the preview — text/richText
 * fields become contenteditable, link fields get a link popover, image
 * fields open the asset picker. A block without data-ek-field renders fine
 * but cannot be edited. Add it to every editable element in your own blocks.
 */
export function Hero({
  headline,
  image,
  cta,
}: {
  headline: string;
  image: EkImageValue;
  cta?: EkLinkValue;
}) {
  return (
    <section>
      <h1 data-ek-field="headline">{headline}</h1>
      {image?.url ? (
        <div data-ek-field="image">
          <img src={image.url} alt={image.alt ?? ""} />
        </div>
      ) : null}
      {cta ? (
        <a data-ek-field="cta" href={cta.href}>
          {cta.label ?? cta.href}
        </a>
      ) : null}
    </section>
  );
}
`;
}

export function renderRoute(): string {
  return `import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EditkraftPage, EditkraftError } from "@editkraft/react";
import { registry } from "@/blocks/registry";
import editkraftConfig from "@/editkraft.config";

/**
 * Public render route: serves PUBLISHED Editkraft pages under their slug.
 * Reads with the anon/publishable key — Editkraft's RLS policies expose
 * published content only, drafts stay protected.
 *
 * Catch-all semantics: your existing static routes always win; unknown
 * paths fall through to this route and are looked up in Editkraft.
 *
 * i18n projects (e.g. next-intl with an app/[locale] segment): move this
 * file to app/[locale]/[...slug]/page.tsx, take \`locale\` from params and
 * pass it to <EditkraftPage locale={locale} …>. If your middleware uses a
 * path matcher, exclude \`editkraft\` from it so the Studio preview iframe
 * is not redirected.
 */
function publicClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const { data: page } = await publicClient()
    .from("ek_pages")
    .select("title, meta")
    .eq("slug", slugPath)
    .eq("status", "published")
    .maybeSingle();
  if (!page) return {};
  const meta = (page.meta ?? {}) as { description?: string };
  return {
    title: page.title,
    ...(meta.description ? { description: meta.description } : {}),
  };
}

export default async function EditkraftContentPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  try {
    return await EditkraftPage({
      supabase: publicClient(),
      slug: slug.join("/"),
      registry,
      defaultLocale: editkraftConfig.defaultLocale,
    });
  } catch (error) {
    if (error instanceof EditkraftError && error.code === "PAGE_NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}

// For hreflang metadata across published locales, see getAlternateLocales
// in the @editkraft/react README.
`;
}

export function revalidateRoute(): string {
  return `import { createRevalidateHandler } from "@editkraft/react";

/**
 * Revalidate endpoint. Called by a Supabase webhook on publish and
 * secured with a shared secret (EDITKRAFT_REVALIDATE_SECRET).
 */
export const POST = createRevalidateHandler({
  secret: process.env.EDITKRAFT_REVALIDATE_SECRET,
});
`;
}

export function previewRoute(): string {
  return `import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { loadDraftContent } from "@editkraft/react";
import { verifyDraftToken } from "@editkraft/schema";
import { PreviewClient } from "../preview-client";
import editkraftConfig from "@/editkraft.config";

/**
 * Preview route for the Studio. Accessed via a signed, short-lived
 * draft token (?token=…) instead of the Draft Mode cookie — this also works
 * in a cross-origin iframe. Loads draft content server-side (service key)
 * and passes only serializable content to the client wrapper.
 *
 * Reads an optional \`?locale=\` search param and passes it (plus this
 * project's configured \`defaultLocale\`) to \`loadDraftContent\`. Without it,
 * @editkraft/react 0.5.2+ still resolves deterministically instead of
 * throwing once a slug has 2+ locale rows, but multi-locale sites should
 * pass \`locale\` explicitly so the correct translation's draft is shown.
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
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const page = await loadDraftContent(supabase, slug?.join("/") ?? "", {
    ...(locale ? { locale } : {}),
    ...(editkraftConfig.defaultLocale ? { defaultLocale: editkraftConfig.defaultLocale } : {}),
  });
  if (!page) notFound();

  return (
    <PreviewClient
      content={page.content}
      studioOrigin={process.env.NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN ?? ""}
    />
  );
}
`;
}

export function previewClient(): string {
  return `"use client";

import type { PageContent } from "@editkraft/schema";
import { EditkraftPreview } from "@editkraft/react/preview";
import { registry } from "@/blocks/registry";

/**
 * Client wrapper: imports the registry (with components) on the client side so
 * no functions cross the server→client boundary. The server
 * passes only serializable draft content.
 *
 * NOTE: this route lives OUTSIDE your app's usual layout segments. If your
 * blocks wrap components that need React context (next-intl, theme providers,
 * …), wrap <EditkraftPreview> with those providers here — otherwise the
 * preview crashes silently and nothing is clickable in the Studio.
 *
 * TIP: to show your site chrome (header/footer from a route-group layout)
 * around the preview, render it here wrapped in a container with
 * className="pointer-events-none" — visible for context, but its links must
 * not navigate the Studio iframe away.
 */
export function PreviewClient({
  content,
  studioOrigin,
}: {
  content: PageContent;
  studioOrigin: string;
}) {
  return <EditkraftPreview content={content} registry={registry} studioOrigin={studioOrigin} />;
}
`;
}

/** Env vars that init mentions in the .env.local example and its output. */
export function envExample(): string {
  return `# Editkraft
# Supabase for your project (never prefix the server-only service key with NEXT_PUBLIC_!)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Shared secret for the revalidate webhook
EDITKRAFT_REVALIDATE_SECRET=
# Shared secret for signed draft-preview tokens (Studio <-> customer site)
EDITKRAFT_PREVIEW_SECRET=
# Allowed Studio origin for the preview bridge
NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN=https://studio.editkraft.com
`;
}
