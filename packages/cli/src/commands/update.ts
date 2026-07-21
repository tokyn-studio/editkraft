import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";

/** Runtime-Pakete, die im Kundenprojekt aktualisiert werden. Die CLI selbst
 *  läuft über `npx` und braucht kein Update. */
const RUNTIME_PACKAGES = ["@editkraft/react", "@editkraft/schema"] as const;

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export function detectPackageManager(root: string): PackageManager {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
  return "npm";
}

const INSTALL_ARGS: Record<PackageManager, string[]> = {
  npm: ["install"],
  pnpm: ["install"],
  yarn: [],
  bun: ["install"],
};

/** Neueste veröffentlichte Version eines Pakets aus der npm-Registry. */
async function latestVersion(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { version?: string };
    return typeof json.version === "string" ? json.version : null;
  } catch {
    return null;
  }
}

/** Version aus einem Range („^0.13.0" → „0.13.0"). */
export function currentVersion(range: string): string {
  return range.replace(/^[\^~>=<\s]*/, "").split(/[\s|]/)[0] ?? range;
}

function majorMinor(v: string): [number, number] {
  const parts = v.replace(/^[^\d]*/, "").split(".");
  return [Number(parts[0]) || 0, Number(parts[1]) || 0];
}

/**
 * Potenziell brechend: anderer Major — oder bei 0.x ein anderer Minor
 * (in editkrafts Contract ist der schema-Minor die Bruchgrenze).
 */
export function isBreaking(from: string, to: string): boolean {
  const [fMaj, fMin] = majorMinor(from);
  const [tMaj, tMin] = majorMinor(to);
  if (fMaj !== tMaj) return true;
  if (fMaj === 0 && fMin !== tMin) return true;
  return false;
}

export interface UpdateOptions {
  cwd?: string;
  yes?: boolean;
  dryRun?: boolean;
}

export type Target = {
  name: string;
  from: string;
  to: string;
  where: "dependencies" | "devDependencies";
  breaking: boolean;
};

export type PkgLike = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/**
 * Reine Planungslogik (testbar): welche @editkraft-Runtime-Pakete sind vorhanden,
 * von welcher auf welche Version, und ist der Sprung potenziell brechend.
 * `latest` = Paketname → neueste Version (aus der npm-Registry); fehlt ein
 * Eintrag, gilt das Paket als aktuell.
 */
export function planUpdate(
  pkg: PkgLike,
  latest: Record<string, string>,
): { targets: Target[]; outdated: Target[] } {
  const deps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};
  const targets: Target[] = RUNTIME_PACKAGES.filter(
    (name) => name in deps || name in devDeps,
  ).map((name) => {
    const where: Target["where"] = name in deps ? "dependencies" : "devDependencies";
    const from = (where === "dependencies" ? deps : devDeps)[name]!;
    const to = latest[name] ?? currentVersion(from);
    return { name, from, to, where, breaking: isBreaking(currentVersion(from), to) };
  });
  return { targets, outdated: targets.filter((t) => currentVersion(t.from) !== t.to) };
}

export async function update(options: UpdateOptions = {}): Promise<number> {
  const root = resolve(options.cwd ?? process.cwd());
  p.intro(pc.bgCyan(pc.black(" editkraft update ")));

  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) {
    p.log.error("No package.json here — run this in your project root.");
    p.outro(pc.red("Nothing to update."));
    return 1;
  }

  let pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    p.log.error("Could not read package.json.");
    p.outro(pc.red("Nothing to update."));
    return 1;
  }
  const deps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};

  const present = RUNTIME_PACKAGES.filter((name) => name in deps || name in devDeps);
  if (present.length === 0) {
    p.log.warn("No @editkraft/* packages found in this project's dependencies.");
    p.outro(pc.yellow("Nothing to update."));
    return 0;
  }

  const spin = p.spinner();
  spin.start("Checking the latest versions on npm …");
  const latest: Record<string, string> = {};
  for (const name of present) {
    const v = await latestVersion(name);
    if (!v) {
      spin.stop(pc.red("Could not reach the npm registry."));
      p.log.error(`Failed to fetch the latest version of ${name}.`);
      p.outro(pc.red("Update aborted."));
      return 1;
    }
    latest[name] = v;
  }
  spin.stop("Latest versions resolved.");

  const { targets, outdated } = planUpdate(pkg, latest);
  if (outdated.length === 0) {
    for (const t of targets) p.log.success(`${t.name} is up to date (${t.to}).`);
    p.outro(pc.green("Everything is already up to date."));
    return 0;
  }

  p.log.message(
    outdated
      .map(
        (t) =>
          `${pc.bold(t.name)}  ${pc.dim(currentVersion(t.from))} → ${
            t.breaking ? pc.yellow(t.to) : pc.green(t.to)
          }${t.breaking ? pc.yellow("  (review changelog)") : ""}`,
      )
      .join("\n"),
  );

  const anyBreaking = outdated.some((t) => t.breaking);
  if (anyBreaking) {
    p.log.warn(
      "A version marked (review changelog) may include breaking changes.\n" +
        `Read what changed at ${pc.cyan("https://editkraft.com/releases")} first.`,
    );
  }

  if (options.dryRun) {
    p.outro(pc.dim("Dry run — nothing written."));
    return 0;
  }

  if (!options.yes) {
    const ok = await p.confirm({ message: "Update package.json and install?" });
    if (p.isCancel(ok) || !ok) {
      p.outro(pc.dim("Cancelled."));
      return 0;
    }
  }

  // package.json aktualisieren (Caret-Range auf die neueste Version).
  for (const t of outdated) {
    const bucket = t.where === "dependencies" ? pkg.dependencies! : pkg.devDependencies!;
    bucket[t.name] = `^${t.to}`;
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  p.log.success("package.json updated.");

  // Installieren (Paketmanager aus dem Lockfile).
  const pm = detectPackageManager(root);
  spin.start(`Installing with ${pm} …`);
  const result = spawnSync(pm, INSTALL_ARGS[pm], { cwd: root, stdio: "pipe", encoding: "utf8" });
  if (result.status === 0) {
    spin.stop("Dependencies installed.");
  } else {
    spin.stop(pc.yellow("Install did not complete."));
    p.log.warn(
      `package.json is updated, but ${pm} install failed. Run it manually:\n` +
        pc.cyan(`  ${pm} ${INSTALL_ARGS[pm].join(" ")}`.trim()),
    );
  }

  p.note(
    `Run ${pc.cyan("npx editkraft doctor")} to verify migrations, env and registry.\n` +
      `If a new schema version added migrations, apply them with ${pc.cyan("supabase db push")}.\n` +
      `Then redeploy your site to serve the new runtime.`,
    "Next steps",
  );
  p.outro(pc.green("Runtime updated."));
  return 0;
}
