import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { detectProject, applyFiles } from "../fs";
import { generateFiles } from "../generate";

/** Timestamp of an already-existing Editkraft migration (for idempotency). */
function existingMigrationTimestamp(root: string): string | null {
  const dir = join(root, "supabase", "migrations");
  if (!existsSync(dir)) return null;
  const match = readdirSync(dir).find((f) => f.endsWith("_editkraft_init.sql"));
  return match ? (match.split("_")[0] ?? null) : null;
}

export interface InitOptions {
  cwd: string;
  yes: boolean;
  force: boolean;
  /** Injectable for tests; otherwise derived from the current time. */
  timestamp?: string;
}

function defaultTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** `editkraft init` — interactive setup; idempotent. */
export async function init(options: InitOptions): Promise<number> {
  p.intro(pc.bgCyan(pc.black(" editkraft init ")));

  const project = detectProject(options.cwd);

  if (!project.isNext || !project.isAppRouter) {
    const msg =
      "No Next.js App Router project detected (no app/ or src/app/, and no next in package.json).";
    if (options.yes) {
      p.log.warn(msg + " Continuing anyway (--yes).");
    } else {
      const proceed = await p.confirm({
        message: msg + " Continue anyway?",
        initialValue: false,
      });
      if (p.isCancel(proceed) || !proceed) {
        p.cancel("Cancelled.");
        return 1;
      }
    }
  }

  if (!project.hasSupabase) {
    p.log.warn(
      "No Supabase setup found. The migration will be written to " +
        "supabase/migrations anyway; set up the Supabase CLI afterwards.",
    );
  }

  // Reuse an existing migration so a repeat run doesn't create a second one.
  const timestamp =
    options.timestamp ?? existingMigrationTimestamp(project.root) ?? defaultTimestamp();
  const specs = generateFiles({ srcDir: project.srcDir, timestamp });
  const results = applyFiles(project.root, specs, { force: options.force });

  for (const r of results) {
    const label =
      r.outcome === "created"
        ? pc.green("created")
        : r.outcome === "identical"
          ? pc.dim("identical")
          : pc.yellow("skipped");
    p.log.message(`${label}  ${r.path}`);
  }

  const skipped = results.filter((r) => r.outcome === "skipped");
  if (skipped.length > 0 && !options.force) {
    p.log.info(
      `${skipped.length} existing file(s) left unchanged. ` +
        "Overwrite with --force.",
    );
  }

  const migration = specs.find((s) => s.path.includes("migrations"))!.path;
  p.note(
    [
      `1. Run the migration:  ${pc.cyan("supabase db push")}  (or commit it in supabase/migrations)`,
      `   → ${migration}`,
      `2. Set ENV (see ${pc.cyan(".env.editkraft.example")}):`,
      "   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EDITKRAFT_REVALIDATE_SECRET,",
      "   NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN",
      `3. Install ${pc.cyan("@editkraft/react @editkraft/schema @supabase/supabase-js zod")} and add blocks in blocks/registry.ts`,
      `   Every editable element needs ${pc.cyan('data-ek-field="<prop>"')} — see blocks/Hero.tsx`,
      `4. i18n project (e.g. next-intl)? Move ${pc.cyan("app/[...slug]")} under your locale segment`,
      `   and exclude ${pc.cyan("editkraft")} from your middleware matcher (Studio preview iframe).`,
      `5. Check with  ${pc.cyan("npx editkraft doctor")}`,
    ].join("\n"),
    "Next steps",
  );

  p.outro(pc.green("Editkraft is set up."));
  return 0;
}
