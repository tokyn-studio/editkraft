import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { FileSpec } from "./generate";

export interface ProjectInfo {
  root: string;
  isNext: boolean;
  isAppRouter: boolean;
  srcDir: boolean;
  hasSupabase: boolean;
}

function readJsonSafe(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Detects Next.js (App Router), a src/ layout, and the Supabase CLI in the project. */
export function detectProject(root: string): ProjectInfo {
  const abs = resolve(root);
  const pkg = readJsonSafe(join(abs, "package.json"));
  const deps = {
    ...((pkg?.dependencies as Record<string, string>) ?? {}),
    ...((pkg?.devDependencies as Record<string, string>) ?? {}),
  };
  const isNext = "next" in deps || existsSync(join(abs, "next.config.js")) ||
    existsSync(join(abs, "next.config.ts")) || existsSync(join(abs, "next.config.mjs"));
  const srcDir = existsSync(join(abs, "src", "app"));
  const isAppRouter = existsSync(join(abs, "app")) || srcDir;
  const hasSupabase =
    existsSync(join(abs, "supabase", "config.toml")) ||
    existsSync(join(abs, "supabase")) ||
    "supabase" in deps;

  return { root: abs, isNext, isAppRouter, srcDir, hasSupabase };
}

export type ApplyOutcome = "created" | "skipped" | "identical";

export interface ApplyResult {
  path: string;
  outcome: ApplyOutcome;
}

/**
 * Writes the files idempotently. Existing files are NOT overwritten
 * (outcome "skipped"), unless `force` is set. Identical content → "identical".
 */
export function applyFiles(
  root: string,
  specs: FileSpec[],
  options: { force?: boolean } = {},
): ApplyResult[] {
  const abs = resolve(root);
  return specs.map((spec) => {
    const target = join(abs, spec.path);
    if (existsSync(target)) {
      const current = readFileSync(target, "utf8");
      if (current === spec.content) return { path: spec.path, outcome: "identical" };
      if (!options.force) return { path: spec.path, outcome: "skipped" };
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, spec.content, "utf8");
    return { path: spec.path, outcome: "created" };
  });
}
