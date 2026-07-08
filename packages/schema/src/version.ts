import type { PageContent } from "./block";

/**
 * SemVer des Contracts. MUSS mit der `version` in package.json übereinstimmen.
 * Jeder geschriebene Blocktree trägt die schemaVersion, unter der er entstand.
 *
 * Breaking-Change-Regel: alles, was einen existierenden Blocktree ungültig macht
 * oder das Verhalten der Feld-Primitives ändert, ist ein Major-Release.
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
    throw new Error(`Ungültige SemVer-Version: "${input}"`);
  }
  return { major: major!, minor: minor!, patch: patch! };
}

export function majorOf(version: string): number {
  return parse(version).major;
}

function cmp(a: Semver, b: Semver): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** Wandelt ^/~/Wildcards in eine untere und (exklusive) obere Grenze um. */
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

/** Prüft einen einzelnen Vergleichsoperator (>=, <=, >, <, =). */
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
 * Erfüllt `version` die SemVer-Range? Unterstützt ^, ~, Wildcards, exakte
 * Versionen und mit Leerzeichen verknüpfte Komparatoren (UND); `||` als ODER.
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
    // Komparator-Set (durch Leerzeichen getrennt, alle müssen gelten)
    return trimmed
      .split(/\s+/)
      .filter(Boolean)
      .every((comp) => satisfiesComparator(v, comp));
  });
}

/**
 * Ist ein unter `writtenVersion` geschriebener Tree mit `supportedRange`
 * kompatibel? Das Studio deklariert `supportedSchemaVersions` als Range.
 */
export function isCompatible(writtenVersion: string, supportedRange: string): boolean {
  return satisfies(writtenVersion, supportedRange);
}

// --- Content-Migrationen (Gerüst) --------------------------------------------

export interface ContentMigration {
  from: string;
  to: string;
  migrate: (content: PageContent) => PageContent;
}

const migrations: ContentMigration[] = [];

/** Registriert eine Migration zwischen zwei Contract-Versionen. */
export function registerMigration(migration: ContentMigration): void {
  migrations.push(migration);
}

/** Nur für Tests: Migrations-Registry leeren. */
export function _resetMigrations(): void {
  migrations.length = 0;
}

/**
 * Migriert Content auf `to` (Default: aktuelle SCHEMA_VERSION).
 * - gleiche Major-Version → strukturkompatibel, nur neu stempeln
 * - sonst → registrierte Migration anwenden oder mit Handlungsanweisung werfen
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
    `Keine Migration von schemaVersion ${content.schemaVersion} nach ${to} registriert. ` +
      "Registriere eine Migration mit registerMigration() oder aktualisiere den Content im Studio.",
  );
}
