# editkraft

## 0.4.0

### Minor Changes

- b72d0a5: Site globals — site-wide content (contact data, claim, …) defined in code,
  stored in the customer's Supabase, edited inline in the Studio:

  - **`defineGlobals`** (`@editkraft/schema`): declare globals with the existing
    field primitives; derives serializable `GlobalsFieldDescriptor[]` exactly
    like `defineBlock`. New row schema `ekGlobalsRowSchema`; two additive bridge
    messages `ek:globals` (descriptors + draft values, preview → studio) and
    `ek:global-update` (value patch, bidirectional). The tree format is
    unchanged — `SCHEMA_VERSION` stays 0.1.0; old counterparts parse the new
    messages to `null` and ignore them.
  - **Loaders & rendering** (`@editkraft/react`): `loadGlobals` /
    `loadDraftGlobals` (never throw — missing table or invalid values fall back
    to `null` so code defaults keep the site rendering), `globalsTag()` for ISR,
    and a `globals` option on `renderBlocks`/`EditkraftPage` that passes the
    values to every block as a `globals` prop.
  - **Inline editing** (`@editkraft/react` preview): elements marked
    `data-ek-global="<key>"` become contenteditable (kind `text`/`richText`),
    with the proven debounce + echo-guard mechanics; edits update every
    occurrence in the canvas and the server-rendered site chrome.
  - **Revalidate handler**: payload `{ globals: true }` invalidates the
    site-wide globals tag.
  - **CLI**: third scaffolded migration `*_editkraft_globals.sql` — single-row
    `ek_globals` table (`id = 1`), draft protected by a column GRANT
    (anon/authenticated can only select `id, published, updated_at`).

## 0.3.1

### Patch Changes

- 3a25858: Content editing complete — validated by two real customer onboardings:

  - **Rich text**: the sanitizer allowlist now covers `ul`/`ol`/`li`,
    `blockquote`, `code`, and the void tags `br`/`hr`; links may carry
    `target="_blank"` (then `rel="noopener noreferrer"` is enforced — attributes
    are still rebuilt, never passed through). The tree format is unchanged:
    `SCHEMA_VERSION` stays 0.1.0, older renderers strip the new tags gracefully.
  - **`ekSelect`** — new field primitive for strict choices (icon keys, layout
    variants): `ekSelect({ options: [{ value, label? }], label? })`. Validation
    is a strict enum; the field metadata (`kind: "select"` with options) travels
    through block descriptors and the preview protocol.
  - **Preview editing UI** (`@editkraft/react`): toolbar buttons for bullet/
    numbered lists and blockquote; select fields open an options popover and
    write immediately via `ek:update` (no contenteditable on select fields).
  - **CLI template**: the preview client documents how to render the site
    chrome (header/footer from a route-group layout) around the preview in a
    `pointer-events-none` wrapper.

## 0.3.0

### Minor Changes

- 2aa0aa6: Customer-ready scaffold — learnings from the first real end-to-end onboarding:

  - `init` now scaffolds the public render route (`app/[...slug]/page.tsx`) serving
    published pages incl. `generateMetadata`; existing static routes always win.
  - The example Hero block carries `data-ek-field` on every editable element and
    documents the inline-editing contract (blocks without the attribute render but
    cannot be edited in the Studio).
  - Preview client template documents the provider requirement for apps whose
    components need React context (next-intl, themes).
  - "Next steps" now covers installing `@supabase/supabase-js`, the i18n route
    placement, and the middleware-matcher exclusion for the Studio preview.
  - `.env.editkraft.example` points to the real Studio origin.
  - `@editkraft/react`: README documents the `data-ek-field` inline-editing
    contract and the slots-over-lists modelling rule.

## 0.2.1

### Patch Changes

- 55d1a25: The scaffolded preview route (`app/editkraft/preview/[[...slug]]/page.tsx`,
  written by `editkraft init`) now reads an optional `?locale=` search param
  and passes it — plus the project's configured `defaultLocale` — through to
  `loadDraftContent`. Pairs with the `@editkraft/react` patch that fixes
  `loadDraftContent`'s multi-locale crash (it no longer throws without a
  locale filter, but the correct translation's draft is only shown when
  `locale` is passed explicitly). Existing projects should re-run `editkraft
init` to pick up the updated template.

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
