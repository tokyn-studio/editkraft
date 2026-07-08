import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { detectProject, applyFiles } from "../fs";
import { generateFiles } from "../generate";

/** Zeitstempel einer bereits vorhandenen Editkraft-Migration (für Idempotenz). */
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
  /** Injizierbar für Tests; sonst aus der aktuellen Zeit. */
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

/** `editkraft init` – interaktive Einrichtung; idempotent. */
export async function init(options: InitOptions): Promise<number> {
  p.intro(pc.bgCyan(pc.black(" editkraft init ")));

  const project = detectProject(options.cwd);

  if (!project.isNext || !project.isAppRouter) {
    const msg =
      "Kein Next.js-App-Router-Projekt erkannt (kein app/ bzw. src/app/ und kein next in package.json).";
    if (options.yes) {
      p.log.warn(msg + " Fahre trotzdem fort (--yes).");
    } else {
      const proceed = await p.confirm({
        message: msg + " Trotzdem fortfahren?",
        initialValue: false,
      });
      if (p.isCancel(proceed) || !proceed) {
        p.cancel("Abgebrochen.");
        return 1;
      }
    }
  }

  if (!project.hasSupabase) {
    p.log.warn(
      "Kein Supabase-Setup gefunden. Die Migration wird trotzdem unter " +
        "supabase/migrations abgelegt; richte die Supabase-CLI danach ein.",
    );
  }

  // Vorhandene Migration wiederverwenden, damit ein erneuter Lauf keine zweite anlegt.
  const timestamp =
    options.timestamp ?? existingMigrationTimestamp(project.root) ?? defaultTimestamp();
  const specs = generateFiles({ srcDir: project.srcDir, timestamp });
  const results = applyFiles(project.root, specs, { force: options.force });

  for (const r of results) {
    const label =
      r.outcome === "created"
        ? pc.green("erstellt ")
        : r.outcome === "identical"
          ? pc.dim("identisch")
          : pc.yellow("übersprungen");
    p.log.message(`${label}  ${r.path}`);
  }

  const skipped = results.filter((r) => r.outcome === "skipped");
  if (skipped.length > 0 && !options.force) {
    p.log.info(
      `${skipped.length} vorhandene Datei(en) unverändert gelassen. ` +
        "Mit --force überschreiben.",
    );
  }

  const migration = specs.find((s) => s.path.includes("migrations"))!.path;
  p.note(
    [
      `1. Migration ausführen:  ${pc.cyan("supabase db push")}  (oder in supabase/migrations committen)`,
      `   → ${migration}`,
      `2. ENV setzen (siehe ${pc.cyan(".env.editkraft.example")}):`,
      "   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EDITKRAFT_REVALIDATE_SECRET,",
      "   NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN",
      `3. ${pc.cyan("@editkraft/react")} installieren und Blöcke in blocks/registry.ts ergänzen`,
      `4. Prüfen mit  ${pc.cyan("npx editkraft doctor")}`,
    ].join("\n"),
    "Nächste Schritte",
  );

  p.outro(pc.green("Editkraft ist eingerichtet."));
  return 0;
}
