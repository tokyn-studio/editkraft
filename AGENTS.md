# Editkraft (Open Source) – Agent-Leitfaden

> Dieselbe Datei gilt als `CLAUDE.md` (Claude Code) und `AGENTS.md` (Antigravity).
> `CLAUDE.md` verweist auf diese Datei. Vollständig lesen, bevor du Code schreibst.

## Mission

Editkraft ist ein visuelles CMS für Next.js-Websites auf Vercel mit Supabase als
Datenhaltung. Dieses Repo (`tokyn-studio/editkraft`, MIT) enthält alles, was **im
Kundenprojekt** lebt: Schema/Contract, Renderer, Block-Registry, CLI und den
Claude-Code-Skill. Veröffentlicht als npm-Pakete unter dem Scope `@editkraft`.

**Produktversprechen:** Der Lese-Pfad (Kunden-Supabase → Renderer → Website) hat
**keinerlei** Abhängigkeit zur Editkraft-Infrastruktur. Jede Kundenseite rendert
weiter, auch wenn das Studio nicht erreichbar ist. Content gehört dem Kunden.

## Repos & lokale Pfade

- **Dieses Repo (OSS):** `editkraft.public/` (Remote: `tokyn-studio/editkraft`).
- **Studio (proprietär):** `../editkraft.studio/` (Remote: `tokyn-studio/editkraft-studio`).
  Konsumiert `@editkraft/schema` als gepinnte Dependency.

**Cross-Repo-Regel:** Im Studio-Repo darfst du **lesen** (für Contract-Abgleich),
niemals schreiben. Studio-Änderungen laufen über dessen eigenes Repo.

## Tech-Stack (verbindlich)

- Monorepo: pnpm workspaces + Turborepo
- TypeScript strict, ESM-first, Builds mit tsup (ESM + CJS + d.ts)
- Validierung: Zod – `@editkraft/schema` ist Zod-first, Typen via `z.infer`
- Renderer-Peer-Deps (nie bundeln): react >= 18, next >= 14 (App Router),
  @supabase/supabase-js v2
- CLI: Node >= 20, kleine Dependency-Fläche
- Tests: Vitest; Renderer + Testing Library; CLI Snapshot-Tests
- Releases: Changesets + GitHub Actions
- Lizenz: MIT (`LICENSE` im Root und in jedem Paket)

## Paketstruktur

```
packages/schema  @editkraft/schema  – Blocktree, Zod-Schemas, Typen (der CONTRACT)
packages/react   @editkraft/react   – Renderer, Registry, Preview-Bridge
packages/cli     editkraft          – npx editkraft init | doctor
skills/editkraft Claude-Code-Skill
apps/example      Next.js-Testbett (nicht published)
docs/             ROADMAP.md, DECISIONS.md, CONTRACT.md
```

## Der Contract (`@editkraft/schema`)

Das wichtigste Paket – die Einigung zwischen Renderer, CLI und Studio.
Dependency-arm (nur Zod), kein React-/Next-Bezug.

**Breaking-Change-Regel (ohne Ausnahme):** Jede Änderung, die einen existierenden
Blocktree ungültig macht oder das Verhalten der Feld-Primitives ändert, ist ein
**Major-Release**. Das Studio deklariert `supportedSchemaVersions` als SemVer-Range;
diese Disziplin ist der gesamte Sync-Mechanismus zwischen den Repos.

Details der öffentlichen API und aller Primitives: `docs/CONTRACT.md`.
Jede Contract-Entscheidung ist in `docs/DECISIONS.md` (ADR-Kurzformat) begründet –
das Studio-Team liest nur diese beiden Dateien.

## Arbeitsweise & Qualität

- Meilensteine strikt nacheinander; nach jedem kurze Zusammenfassung, dann Freigabe.
- Changesets ist Pflicht: kein PR mit Paketänderung ohne Changeset-Datei.
- SemVer strikt; `schema` versioniert unabhängig von `react`/`cli`.
  `react`/`cli` deklarieren ihre `schema`-Kompatibilität als Peer-Range.
- Public API jedes Pakets klein halten; Nicht-Exportiertes ist intern.
- Conventional Commits; kein Commit mit rotem Test oder TS-Fehler.
- CI auf jedem PR: Lint, Typecheck, Tests, Build, Example-Smoke.
- Unklare/widersprüchliche Anforderung → nachfragen, nicht still interpretieren.

## Nicht-Ziele dieses Repos

- Der visuelle Editor (UI, Drag&Drop, Formulare) – Studio-Repo. Hier nur
  Preview-Bridge + Protokoll.
- Auth, Orgs, Billing, Entitlements – Studio-Repo.
- Feature-Scope verbindlich in `docs/ROADMAP.md` (gilt bei Widerspruch zu diesem Dokument):
  i18n-Datenmodell ist v1-CONTRACT (Roadmap 1.4), Scheduling erst V2 (2.6),
  Freigabe-Workflows Studio-Repo (2.5).
- Pages Router / andere Frameworks – App Router only.

## Meilensteine

1. Fundament + Contract (`@editkraft/schema` vollständig, CI, Changesets).
2. CLI + Kunden-Migrationen (`init`, `doctor`, RLS-Tests).
3. Renderer (Registry, `<EditkraftPage />`, ISR + Revalidate).
4. Preview-Bridge + Skill (Draft Mode, Overlays, postMessage-Protokoll).
