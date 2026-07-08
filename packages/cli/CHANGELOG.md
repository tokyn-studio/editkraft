# editkraft

## 0.1.1

### Patch Changes

- `editkraft init` generiert die Preview-Route jetzt für den neuen Draft-Flow:
  serverseitiges Laden des Draft-Contents (`loadDraftContent`) und Übergabe an die
  Client-Komponente `EditkraftPreview` aus `@editkraft/react/preview`.

## 0.1.0

### Minor Changes

- Initial release des CLI: `editkraft init` richtet ein Next.js-App-Router-Projekt
  ein (SQL-Migration für `ek_pages`/`ek_page_versions`/`ek_assets` inkl.
  published-only-RLS, `editkraft.config.ts`, `blocks/registry.ts` mit Beispiel-Block,
  Preview-Route und Revalidate-Handler) – idempotent, ohne bestehende Dateien zu
  überschreiben. `editkraft doctor` prüft Migrationstand, ENV und Registry-Konsistenz.
