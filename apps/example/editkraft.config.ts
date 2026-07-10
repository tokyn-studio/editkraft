import type { EditkraftConfig } from "@editkraft/react";

/**
 * Editkraft-Konfiguration deines Projekts.
 * Die erlaubte Studio-Origin kommt aus der ENV (kein Hardcoding von Secrets).
 */
export default {
  // Pfad zur Block-Registry (siehe blocks/registry.ts)
  registry: "./blocks/registry",
  // Erlaubte Origin des Studios für die Preview-Bridge (postMessage-Origin-Check)
  studioOrigin: process.env.NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN ?? "",
  /** BCP-47 locales this site publishes. First entry pages are created in by default. */
  locales: ["de"],
  defaultLocale: "de",
} satisfies EditkraftConfig;
