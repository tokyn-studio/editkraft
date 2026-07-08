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

## Offene TODOs (Nicht-Ziele dieses Repos, bewusst verschoben)
- i18n-Content, Scheduling, Freigabe-Workflows – Feature-Ebene, nicht Contract.
- Content-Migrationen zwischen Major-Versionen: nur Gerüst (`migrateContent`,
  `registerMigration`), konkrete Migrationen entstehen mit der ersten Major-Änderung.
- Pages Router / andere Frameworks – App Router only.
- Der visuelle Editor, Auth/Orgs/Billing – Studio-Repo.
