import { migrationSql } from "./templates/migration";
import {
  editkraftConfig,
  registryTs,
  heroComponent,
  revalidateRoute,
  previewRoute,
  envExample,
} from "./templates/project";

export interface FileSpec {
  /** Pfad relativ zur Projektwurzel. */
  path: string;
  content: string;
}

export interface GenerateOptions {
  /** Projekt nutzt ein src/-Verzeichnis (src/app statt app). */
  srcDir: boolean;
  /** Zeitstempel für den Migrationsdateinamen (für Tests injizierbar). */
  timestamp: string;
}

/**
 * Erzeugt alle Dateien, die `editkraft init` schreibt – rein und ohne
 * Seiteneffekte, damit sie snapshot-getestet werden können.
 */
export function generateFiles(options: GenerateOptions): FileSpec[] {
  const base = options.srcDir ? "src/" : "";
  return [
    {
      path: `supabase/migrations/${options.timestamp}_editkraft_init.sql`,
      content: migrationSql(),
    },
    { path: "editkraft.config.ts", content: editkraftConfig() },
    { path: `${base}blocks/registry.ts`, content: registryTs() },
    { path: `${base}blocks/Hero.tsx`, content: heroComponent() },
    {
      path: `${base}app/api/editkraft/revalidate/route.ts`,
      content: revalidateRoute(),
    },
    {
      path: `${base}app/editkraft/preview/[[...slug]]/page.tsx`,
      content: previewRoute(),
    },
    { path: ".env.editkraft.example", content: envExample() },
  ];
}
