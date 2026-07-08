# Architektur-Entscheidungen (ADR-Kurzformat)

Jede Contract-Entscheidung mit 2–3 Sätzen. Das Studio-Team liest nur diese Datei
und `CONTRACT.md`.

## ADR-001: Monorepo mit pnpm + Turborepo, unabhängige Paketversionen
`schema`, `react` und `cli` werden über Changesets **unabhängig** versioniert;
`react`/`cli` deklarieren ihre `schema`-Kompatibilität als Peer-Range. So kann
der Contract stabil bleiben, während Renderer/CLI sich schneller bewegen.

## ADR-002: `@editkraft/schema` ist Zod-first und dependency-arm
Der Contract nutzt ausschließlich Zod (keine React-/Next-/Node-Abhängigkeit) und
leitet alle Typen per `z.infer` ab. Damit ist er in jeder Umgebung (Renderer,
CLI, Studio-Backend) einsetzbar und bleibt klein.

## ADR-003: Feld-Metadaten via WeakMap statt `.describe()`
Primitives hängen ihre Metadaten über eine WeakMap an die konkrete
Schema-Instanz. Das überlebt die Platzierung in `z.object` und `.optional()`/
`.default()`/`.nullable()`, aber nicht `.describe()` (klont). Labels kommen
deshalb aus der Primitive-Konfiguration – bewusst, um eine eindeutige Quelle zu
haben. Alternative (Zod-4-`.meta()`) wurde verworfen, weil das Studio auf
Zod 3.25 gepinnt ist.

## ADR-004: `defineBlock` erzwingt Primitives und leitet serialisierbare Felder ab
Jedes Block-Feld MUSS ein Editkraft-Primitive sein; sonst wirft `defineBlock`.
Das garantiert, dass das Studio jedes Feld editieren kann, und liefert eine
JSON-serialisierbare `fields`-Beschreibung, ohne dass das Studio Zod ausführen
muss.

## ADR-005: Bild/Link/Referenz als strukturierte Werte, Farbe/Text als String
`ekImage`/`ekLink`/`ekReference` haben eigene Wert-Schemas (u. a. `assetId`,
`href`, `id`), damit Renderer und Studio dieselbe Struktur teilen. `ekColor` ist
ein String (Hex oder Token) – die konkrete Farbauflösung ist Sache des
Kundenprojekts (Design-Tokens), nicht des Contracts.

## ADR-006: schemaVersion pro Blocktree + Breaking-Change = Major
Jeder `PageContent` trägt die `schemaVersion`, unter der er geschrieben wurde.
Kompatibilität wird über SemVer-Ranges geprüft; jede Änderung, die einen
existierenden Tree ungültig macht, ist ein Major-Release. Diese Disziplin ist der
gesamte Sync-Mechanismus zwischen OSS- und Studio-Repo.

## ADR-007: Eigene minimale SemVer-Range-Logik statt `semver`-Dependency
`satisfies` unterstützt `^`, `~`, Wildcards, Komparatoren und `||` – ausreichend
für `supportedSchemaVersions`. Bewusst selbst implementiert, um die Dependency
`semver` zu vermeiden und den Contract dependency-arm zu halten. Prerelease-Tags
werden für den Vergleich abgeschnitten (kein Prerelease-Ordering).

## ADR-008: postMessage-Protokoll mit channel + Version + Pflicht-Origin-Check
Jede Nachricht trägt `channel: "editkraft"` und `v`; `parseMessage` gibt bei
Fremd-/Fehl-Nachrichten `null` statt zu werfen, damit die Bridge robust bleibt.
Die Origin-Prüfung (`isAllowedOrigin`) ist verpflichtend und liegt beim
Empfänger – das Protokoll authentifiziert nicht selbst.

## ADR-009: Kunden-Tabellen mit Prefix `ek_`, published-only-RLS
Die CLI legt `ek_pages`, `ek_page_versions`, `ek_assets` an (Prefix zur
Kollisionsvermeidung im Kundenprojekt). RLS: `anon`/`authenticated` lesen
ausschließlich published Content (Versionen nur über `published_version_id`
verknüpft); alle Schreibzugriffe und Draft-Reads laufen über `service_role`
(umgeht RLS, bekommt daher keine Policies). Damit hält der Lese-Pfad das
Produktversprechen ohne Editkraft-Infrastruktur.

## ADR-010: `editkraft init` ist idempotent und überschreibt nie ungefragt
Generierte Dateien werden nur angelegt, wenn sie fehlen (sonst „skipped"),
außer `--force`. Eine bereits vorhandene `*_editkraft_init.sql` wird per
Timestamp wiederverwendet, sodass ein erneuter Lauf keine zweite Migration
erzeugt. Die Generatoren sind reine Funktionen (`generateFiles`) und werden
per Snapshot getestet; das Anwenden (`applyFiles`) ist davon getrennt.

## ADR-011: CLI dependency-arm, Contract als Peer-Range
Die CLI nutzt nur `@clack/prompts` und `picocolors` (Node ≥ 20, ESM). Sie
importiert `@editkraft/schema` nicht zur Laufzeit (die generierten Dateien
referenzieren es), deklariert die Kompatibilität aber als Peer-Range, damit die
SemVer-Disziplin über alle Pakete sichtbar ist. RLS-Tests liegen als
SQL-Fixture (`packages/cli/test/rls.fixture.sql`, via `set local role`).

## ADR-012: Renderer entkoppelt über Registry und übergebenen Supabase-Client
`@editkraft/react` bündelt weder React/Next noch Supabase (alles Peer-Deps).
`EditkraftPage`/`loadPublishedPage` bekommen den Supabase-Client des Kundenprojekts
übergeben und lesen ausschließlich published Content – der Lese-Pfad hat keine
Editkraft-Abhängigkeit. Unbekannte Block-Typen: Production überspringt +
`console.warn`, Dev zeigt einen sichtbaren Platzhalter (kein stiller Crash).

## ADR-013: schemaVersion-Kompatibilität = gleiche Major
`loadPublishedPage` prüft die geschriebene `schemaVersion` gegen eine Range
(Default: gleiche Major wie das installierte `@editkraft/schema`). Inkompatibel →
`EditkraftSchemaError` mit klarer Handlungsanweisung (Versionen angleichen oder im
Studio migrieren). Das spiegelt die Breaking-Change-Regel (ADR-006) im Renderer.

## ADR-014: ISR-Revalidation tag-basiert über Shared Secret
`createRevalidateHandler` prüft ein Shared Secret (Header oder Query,
längensicherer Vergleich) und ruft `revalidateTag(pageTag(slug))`. Slugs kommen
per Default aus dem Supabase-DB-Webhook (`record`/`old_record`). So invalidiert ein
Publish genau die betroffene(n) Seite(n). Kein Secret konfiguriert → 500 (kein
offener Endpoint).

## ADR-015: Integrationsnachweis statt vollem Playwright (vorerst)
Der DoD-Nachweis „Seite mit zwei Blöcken aus lokaler Supabase" läuft als
Integrationstest in `apps/example` (Seed via service_role, Lesen via Anon-Client
über RLS, `renderBlocks` → HTML). Der Next-`build` der Example-App ist der
CI-Smoke. Ein vollständiger Playwright-Browsertest ist als TODO notiert.

## ADR-016: Preview-Bridge als separates "use client"-Bundle
`EditkraftPreview` ist eine Client-Komponente und wird über den Subpath
`@editkraft/react/preview` exportiert (eigener tsup-Entry). Die `"use client"`-
Direktive wird per Post-Build-Schritt an das Bundle geprependet, weil Treeshake
das alleinstehende Direktiv-Statement sonst entfernt. So bleiben die Server-
Exports in `.` serverfähig. Draft-Content lädt die Server-Preview-Route
(`loadDraftContent`, service_role) und übergibt ihn der Client-Komponente – der
Service-Key erreicht nie den Browser.

## ADR-017: postMessage-Bridge mit Pflicht-Origin-Check und Ziel-Origin
`EditkraftPreview` sendet an `window.parent` immer mit der konkreten
`studioOrigin` (nie `*`) und ignoriert eingehende Nachrichten fremder Origin
(`isAllowedOrigin`). Der Blocktree wird lokal (`updateBlockProps`, immutable)
aktualisiert; die Selektion läuft über Klick-Overlays je Block. Die Message-Typen
kommen aus dem Contract (`@editkraft/schema`).

## Offene TODOs (Nicht-Ziele dieses Repos, bewusst verschoben)
- Playwright-Browser-Smoke der Example-App (aktuell: Integrationstest + Next-Build).
- Overlays für tief verschachtelte Slots (aktuell: Klick-Overlay je Block, rekursiv).
- i18n-Content, Scheduling, Freigabe-Workflows – Feature-Ebene, nicht Contract.
- Content-Migrationen zwischen Major-Versionen: nur Gerüst (`migrateContent`,
  `registerMigration`), konkrete Migrationen entstehen mit der ersten Major-Änderung.
- Pages Router / andere Frameworks – App Router only.
- Der visuelle Editor, Auth/Orgs/Billing – Studio-Repo.
