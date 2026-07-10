import { migrationSql } from "./templates/migration";
import {
  editkraftConfig,
  registryTs,
  heroComponent,
  revalidateRoute,
  previewRoute,
  previewClient,
  envExample,
} from "./templates/project";

export interface FileSpec {
  /** Path relative to the project root. */
  path: string;
  content: string;
}

export interface GenerateOptions {
  /** Project uses a src/ directory (src/app instead of app). */
  srcDir: boolean;
  /** Timestamp for the migration filename (injectable for tests). */
  timestamp: string;
}

/**
 * Generates all the files that `editkraft init` writes — pure and free of
 * side effects, so they can be snapshot-tested.
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
    {
      path: `${base}app/editkraft/preview/preview-client.tsx`,
      content: previewClient(),
    },
    { path: ".env.editkraft.example", content: envExample() },
  ];
}
