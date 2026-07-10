import type { PageContent } from "./block";

/**
 * SemVer of the contract. MUST match the `version` in package.json.
 * Every written block tree carries the schemaVersion it was created under.
 *
 * Breaking-change rule: anything that invalidates an existing block tree
 * or changes the behavior of the field primitives is a major release.
 */
export const SCHEMA_VERSION = "0.1.0";

type Semver = { major: number; minor: number; patch: number };

function parse(input: string): Semver {
  const core = input.trim().replace(/^v/, "").split("+")[0]!.split("-")[0]!;
  const parts = core.split(".");
  const [major, minor, patch] = [parts[0] ?? "0", parts[1] ?? "0", parts[2] ?? "0"].map((n) =>
    Number.parseInt(n, 10),
  );
  if ([major, minor, patch].some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid SemVer version: "${input}"`);
  }
  return { major: major!, minor: minor!, patch: patch! };
}

export function majorOf(version: string): number {
  return parse(version).major;
}

function cmp(a: Semver, b: Semver): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** Converts ^/~/wildcards into a lower and an (exclusive) upper bound. */
function bounds(range: string): { lower: Semver; upper: Semver | null; exact?: Semver } | null {
  const r = range.trim();
  if (r === "" || r === "*" || r === "x" || r === "X") {
    return { lower: { major: 0, minor: 0, patch: 0 }, upper: null };
  }
  if (r.startsWith("^")) {
    const v = parse(r.slice(1));
    let upper: Semver;
    if (v.major > 0) upper = { major: v.major + 1, minor: 0, patch: 0 };
    else if (v.minor > 0) upper = { major: 0, minor: v.minor + 1, patch: 0 };
    else upper = { major: 0, minor: 0, patch: v.patch + 1 };
    return { lower: v, upper };
  }
  if (r.startsWith("~")) {
    const v = parse(r.slice(1));
    return { lower: v, upper: { major: v.major, minor: v.minor + 1, patch: 0 } };
  }
  return null;
}

/** Checks a single comparison operator (>=, <=, >, <, =). */
function satisfiesComparator(v: Semver, comparator: string): boolean {
  const m = comparator.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
  if (!m) return false;
  const op = m[1] ?? "=";
  const target = parse(m[2]!);
  const c = cmp(v, target);
  switch (op) {
    case ">=":
      return c >= 0;
    case "<=":
      return c <= 0;
    case ">":
      return c > 0;
    case "<":
      return c < 0;
    default:
      return c === 0;
  }
}

/**
 * Does `version` satisfy the SemVer range? Supports ^, ~, wildcards, exact
 * versions, and space-joined comparators (AND); `||` as OR.
 */
export function satisfies(version: string, range: string): boolean {
  const v = parse(version);
  return range.split("||").some((clause) => {
    const trimmed = clause.trim();
    const b = bounds(trimmed);
    if (b) {
      const okLower = cmp(v, b.lower) >= 0;
      const okUpper = b.upper === null || cmp(v, b.upper) < 0;
      return okLower && okUpper;
    }
    // Comparator set (space-separated, all must hold)
    return trimmed
      .split(/\s+/)
      .filter(Boolean)
      .every((comp) => satisfiesComparator(v, comp));
  });
}

/**
 * Is a tree written under `writtenVersion` compatible with `supportedRange`?
 * The Studio declares `supportedSchemaVersions` as a range.
 */
export function isCompatible(writtenVersion: string, supportedRange: string): boolean {
  return satisfies(writtenVersion, supportedRange);
}

// --- Content migrations (scaffolding) ----------------------------------------

export interface ContentMigration {
  from: string;
  to: string;
  migrate: (content: PageContent) => PageContent;
}

const migrations: ContentMigration[] = [];

/** Registers a migration between two contract versions. */
export function registerMigration(migration: ContentMigration): void {
  migrations.push(migration);
}

/** Tests only: clears the migration registry. */
export function _resetMigrations(): void {
  migrations.length = 0;
}

/**
 * Migrates content to `to` (default: current SCHEMA_VERSION).
 * - same major version → structurally compatible, just re-stamp
 * - otherwise → apply a registered migration or throw with a course of action
 */
export function migrateContent(content: PageContent, to: string = SCHEMA_VERSION): PageContent {
  if (content.schemaVersion === to) return content;

  if (majorOf(content.schemaVersion) === majorOf(to)) {
    return { ...content, schemaVersion: to };
  }

  const direct = migrations.find(
    (m) => m.from === content.schemaVersion && m.to === to,
  );
  if (direct) {
    return { ...direct.migrate(content), schemaVersion: to };
  }

  throw new Error(
    `No migration registered from schemaVersion ${content.schemaVersion} to ${to}. ` +
      "Register a migration with registerMigration() or update the content in the Studio.",
  );
}
