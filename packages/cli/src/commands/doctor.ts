import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { detectProject } from "../fs";

export type CheckStatus = "ok" | "warn" | "fail";

export interface Check {
  label: string;
  status: CheckStatus;
  hint?: string | undefined;
}

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "EDITKRAFT_REVALIDATE_SECRET",
  "NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN",
];

/** Liest gesetzte ENV-Keys aus process.env und .env*-Dateien im Projekt. */
function knownEnvKeys(root: string): Set<string> {
  const keys = new Set(Object.keys(process.env).filter((k) => process.env[k]));
  for (const file of [".env.local", ".env"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
      if (m && m[2] && m[2].trim() !== "") keys.add(m[1]!);
    }
  }
  return keys;
}

/** Reine Prüf-Logik (testbar): Registry, Migration, ENV. */
export function runDoctorChecks(root: string): Check[] {
  const abs = resolve(root);
  const project = detectProject(abs);
  const checks: Check[] = [];

  checks.push({
    label: "Next.js App Router erkannt",
    status: project.isNext && project.isAppRouter ? "ok" : "warn",
    hint: "Editkraft unterstützt aktuell nur den App Router.",
  });

  const configExists = existsSync(join(abs, "editkraft.config.ts"));
  checks.push({
    label: "editkraft.config.ts vorhanden",
    status: configExists ? "ok" : "fail",
    hint: configExists ? undefined : "Führe `editkraft init` aus.",
  });

  const base = project.srcDir ? join(abs, "src") : abs;
  const registryPath = join(base, "blocks", "registry.ts");
  const registryOk =
    existsSync(registryPath) &&
    readFileSync(registryPath, "utf8").includes("createRegistry");
  checks.push({
    label: "Block-Registry konsistent",
    status: registryOk ? "ok" : "fail",
    hint: registryOk ? undefined : "blocks/registry.ts fehlt oder nutzt kein createRegistry().",
  });

  const migrationsDir = join(abs, "supabase", "migrations");
  const hasMigration =
    existsSync(migrationsDir) &&
    readdirSync(migrationsDir).some((f) => f.endsWith("_editkraft_init.sql"));
  checks.push({
    label: "Editkraft-Migration vorhanden",
    status: hasMigration ? "ok" : "fail",
    hint: hasMigration ? undefined : "Migration fehlt – `editkraft init` erneut ausführen.",
  });

  const env = knownEnvKeys(abs);
  const missing = REQUIRED_ENV.filter((k) => !env.has(k));
  checks.push({
    label: "ENV-Variablen gesetzt",
    status: missing.length === 0 ? "ok" : "warn",
    hint: missing.length === 0 ? undefined : `Fehlt: ${missing.join(", ")}`,
  });

  return checks;
}

/** `editkraft doctor` – gibt die Prüfungen aus, Exit-Code 1 bei einem fail. */
export async function doctor(options: { cwd: string }): Promise<number> {
  p.intro(pc.bgCyan(pc.black(" editkraft doctor ")));
  const checks = runDoctorChecks(options.cwd);

  for (const c of checks) {
    const icon =
      c.status === "ok" ? pc.green("✓") : c.status === "warn" ? pc.yellow("!") : pc.red("✗");
    p.log.message(`${icon} ${c.label}${c.hint ? pc.dim(` – ${c.hint}`) : ""}`);
  }

  const failed = checks.some((c) => c.status === "fail");
  if (failed) {
    p.outro(pc.red("Es gibt offene Punkte."));
    return 1;
  }
  p.outro(pc.green("Alles bereit."));
  return 0;
}
