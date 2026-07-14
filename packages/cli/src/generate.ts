import { migrationSql, i18nMigration, globalsMigration, symbolsMigration, collectionsMigration } from "./templates/migration";
import {
  DEFAULT_LOCALE,
  editkraftConfig,
  registryTs,
  heroComponent,
  renderRoute,
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
 * Increments a fixed-width `YYYYMMDDHHMMSS` timestamp by one.
 *
 * The i18n migration needs a version strictly greater than the init
 * migration's: Supabase keys `schema_migrations` on the version prefix
 * (same version = collision) and applies files in filename-sort order —
 * with an identical timestamp, `_editkraft_i18n` would sort BEFORE
 * `_editkraft_init` and run against a table that does not exist yet.
 * A plain +1 on the numeric string is sufficient here: the result only
 * has to be unique and sort after the original, not be a valid wall time.
 */
function incrementTimestamp(timestamp: string): string {
  return String(BigInt(timestamp) + 1n).padStart(timestamp.length, "0");
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
    {
      // Ships as a SECOND, separate migration so existing installations can
      // apply the i18n contract independently of the init migration.
      // One second later than init so it sorts (and applies) after it.
      path: `supabase/migrations/${incrementTimestamp(options.timestamp)}_editkraft_i18n.sql`,
      content: i18nMigration(DEFAULT_LOCALE),
    },
    {
      // Third, separate migration (Site-Globals) — same reasoning: existing
      // installations pick it up additively; +2s so it sorts after i18n.
      path: `supabase/migrations/${incrementTimestamp(incrementTimestamp(options.timestamp))}_editkraft_globals.sql`,
      content: globalsMigration(),
    },
    {
      // Fourth migration: reserved Symbols table (Roadmap 2.4, unused in v1);
      // +3s so it sorts after globals.
      path: `supabase/migrations/${incrementTimestamp(incrementTimestamp(incrementTimestamp(options.timestamp)))}_editkraft_symbols.sql`,
      content: symbolsMigration(),
    },
    {
      // Fifth migration (Collections) — +4s so it sorts after symbols.
      path: `supabase/migrations/${incrementTimestamp(incrementTimestamp(incrementTimestamp(incrementTimestamp(options.timestamp))))}_editkraft_collections.sql`,
      content: collectionsMigration(DEFAULT_LOCALE),
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
    {
      // Public render route for published pages (catch-all; existing static
      // routes win). i18n projects move it under their locale segment — the
      // template's header comment explains how.
      path: `${base}app/[...slug]/page.tsx`,
      content: renderRoute(),
    },
    { path: ".env.editkraft.example", content: envExample() },
  ];
}
