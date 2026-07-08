# editkraft

## 0.1.2

### Patch Changes

- Preview-Fixes aus dem End-to-End-Test:
  - `createRevalidateHandler` importiert `next/cache` jetzt lazy zur Laufzeit, damit
    der statische Modulgraph von `@editkraft/react` in Client-nahen Bäumen sauber
    bleibt (sonst „revalidateTag only works in a Server Component").
  - `editkraft init` generiert die Preview jetzt als Server-Route + separaten
    Client-Wrapper (`preview-client.tsx`); die Registry wird client-seitig
    importiert und nicht mehr über die Server→Client-Grenze gereicht.

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
