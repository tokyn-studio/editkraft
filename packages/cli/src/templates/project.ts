/**
 * Scaffold-Dateien, die `editkraft init` ins Kundenprojekt schreibt.
 * Alle Templates sind reine Funktionen (snapshot-testbar).
 *
 * Die Renderer-Imports (`@editkraft/react`) funktionieren, sobald das Paket
 * installiert ist (Meilenstein 3). init scaffoldet nur – es installiert nicht.
 */

export function editkraftConfig(): string {
  return `import type { EditkraftConfig } from "@editkraft/react";

/**
 * Editkraft-Konfiguration deines Projekts.
 * Die erlaubte Studio-Origin kommt aus der ENV (kein Hardcoding von Secrets).
 */
export default {
  // Pfad zur Block-Registry (siehe blocks/registry.ts)
  registry: "./blocks/registry",
  // Erlaubte Origin des Studios für die Preview-Bridge (postMessage-Origin-Check)
  studioOrigin: process.env.NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN ?? "",
} satisfies EditkraftConfig;
`;
}

export function registryTs(): string {
  return `import { createRegistry } from "@editkraft/react";
import { defineBlock, ekText, ekImage, ekLink } from "@editkraft/schema";
import { z } from "zod";
import { Hero } from "./Hero";

/**
 * Block-Registry: paart jede Block-Definition mit ihrer React-Komponente.
 * createRegistry validiert, dass jeder Typ Definition UND Komponente hat.
 */
export const registry = createRegistry([
  {
    definition: defineBlock({
      type: "Hero",
      label: "Hero-Bereich",
      schema: z.object({
        headline: ekText({ label: "Überschrift" }),
        image: ekImage({ label: "Bild" }),
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
 * Beispiel-Block. Passe Markup und Styling an dein Design an – die Props kommen
 * validiert aus der Block-Definition in blocks/registry.ts.
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
      <h1>{headline}</h1>
      {image?.url ? <img src={image.url} alt={image.alt ?? ""} /> : null}
      {cta ? <a href={cta.href}>{cta.label ?? cta.href}</a> : null}
    </section>
  );
}
`;
}

export function revalidateRoute(): string {
  return `import { createRevalidateHandler } from "@editkraft/react";

/**
 * Revalidate-Endpoint. Wird per Supabase-Webhook beim Publish aufgerufen und
 * mit einem Shared Secret abgesichert (EDITKRAFT_REVALIDATE_SECRET).
 */
export const POST = createRevalidateHandler({
  secret: process.env.EDITKRAFT_REVALIDATE_SECRET,
});
`;
}

export function previewRoute(): string {
  return `import { EditkraftPreview } from "@editkraft/react";
import { registry } from "@/blocks/registry";

/**
 * Preview-Route für das Studio. Aktiv nur im Next.js Draft Mode; lädt Draft-
 * Content und spricht das postMessage-Protokoll mit dem Studio-iframe.
 */
export default async function EditkraftPreviewPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  return (
    <EditkraftPreview
      registry={registry}
      slug={slug?.join("/") ?? ""}
      studioOrigin={process.env.NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN ?? ""}
    />
  );
}
`;
}

/** Env-Variablen, die init in .env.local-Beispiel und Ausgabe erwähnt. */
export function envExample(): string {
  return `# Editkraft
# Supabase deines Projekts (Server-only Service-Key niemals mit NEXT_PUBLIC_ prefixen!)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Shared Secret für den Revalidate-Webhook
EDITKRAFT_REVALIDATE_SECRET=
# Erlaubte Studio-Origin für die Preview-Bridge
NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN=https://studio.editkraft.dev
`;
}
