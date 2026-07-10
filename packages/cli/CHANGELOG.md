# editkraft

## 0.2.0

### Minor Changes

- 9492038: English-first CLI output plus the i18n contract's upgrade path:

  - All CLI output, error messages, and generated READMEs are now in English
    (previously German).
  - `editkraft init` now scaffolds a **second** migration,
    `supabase/migrations/*_editkraft_i18n.sql`, one timestamp-second after the init
    migration so it always applies after it. It adds `locale` and
    `translation_group_id` to `ek_pages` (both with defaults) and replaces
    `unique(slug)` with `unique(slug, locale)` — additive and idempotent, safe to
    run against an existing installation. Existing projects should re-run
    `editkraft init` to pick it up.
  - The generated `editkraft.config.ts` now declares `locales` and `defaultLocale`
    (defaulting to `["de"]` / `"de"`), matching the new `EditkraftConfig` fields in
    `@editkraft/react`.
  - The default locale is interpolated into the migration SQL, so it's now validated
    against a strict `[A-Za-z0-9-]+` pattern before being written — an invalid or
    hostile value throws instead of producing broken or injectable SQL.

## 0.1.3

### Patch Changes

- Editor-Fundament: neue postMessage-Nachricht `ek:schema` (Preview liefert die
  Block-Feld-Deskriptoren ans Studio), `Registry.descriptors()`, `EditkraftPreview`
  sendet das Schema beim Mount. Neues signiertes Draft-Token (`createDraftToken`/
  `verifyDraftToken`, HMAC via Web Crypto) für cookie-freie Preview; `editkraft init`
  generiert die Preview-Route jetzt token-gegated (ENV `EDITKRAFT_PREVIEW_SECRET`).

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
