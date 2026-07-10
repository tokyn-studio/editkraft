# @editkraft/react

## 0.5.0

### Minor Changes

- 9492038: Locale-aware rendering for the Roadmap 1.4 contract, plus English-first messages:

  - `loadPublishedPage` accepts `locale` and `defaultLocale` in its options. With
    `locale` set, the lookup is narrowed to that locale; if no published page exists
    for it and `defaultLocale` differs, it falls back to `defaultLocale`. Without
    either option, behavior is unchanged. The returned `PublishedPage` now includes
    `locale`.
  - New `getAlternateLocales(supabase, slug, locale?)` returns every published
    translation of a page (siblings sharing `translation_group_id`) for building
    `hreflang` alternates.
  - New `getSitemapEntries(supabase)` returns every published page's slug, locale,
    and last-updated timestamp across all locales, for building a sitemap.
  - `EditkraftPageProps` gains `locale` and `defaultLocale`, forwarded to
    `loadPublishedPage`. `EditkraftConfig` gains optional `locales` and
    `defaultLocale` fields.
  - All thrown/logged error messages in the data loader and `EditkraftPage` are now
    in English (previously German).
  - Restored two side effects the inline-editing refactor had silently dropped from
    image-field selection: the `ek:focus-field` postMessage after an image-field
    `ek:select`, and the `data-editkraft-selected` DOM attribute mirroring the
    current selection. Both use the same imperative, non-re-rendering mechanism the
    refactor introduced, so contentEditable fields still don't lose their cursor on
    selection change.

  > **Upgrade note:** `loadPublishedPage` now selects the `locale` and
  > `translation_group_id` columns unconditionally. Apply the i18n migration
  > (`*_editkraft_i18n.sql`, scaffolded by `npx editkraft init`) BEFORE
  > upgrading this package, or every page load fails with a self-describing
  > `CONTENT_INVALID` error (`column ek_pages.locale does not exist`).

- 103a10f: Rich-text formatting, link editing and image tools in the live preview:

  - Schema: rich-text allowlist extended by p/h2/h3/u/s; `ekImageValue.frame`
    (non-destructive 1:1 framing) plus `imageFrameStyles()` as a shared render
    helper for preview and published pages
  - React: floating formatting toolbar (B/I/U/S, paragraph/H2/H3, links),
    link popover (URL/mail/tel, button and inline links), image popover
    (replace, crop/frame, AI-edit hook), all wired through the existing
    postMessage bridge

### Patch Changes

- Updated dependencies [9492038]
- Updated dependencies [103a10f]
  - @editkraft/schema@0.4.0

## 0.4.0

### Minor Changes

- d86168c: Direct Manipulation im Preview: neue `ek:focus-field`-Nachricht, `ek:update` als
  bidirektionales Protokoll dokumentiert, dependency-freier `sanitizeRichText` +
  `RICH_TEXT_ALLOWLIST` (RichText-Speicherformat = sanitisiertes HTML-Subset).
  Renderer/Preview-Bridge macht `data-ek-field`-Elemente inline editierbar
  (contentEditable, Mini-Toolbar für RichText, Bild-Klick → `ek:focus-field`).
  Der Renderer (`renderBlocks`/`EditkraftPage`) sanitisiert `richText`-Props jetzt
  zentral vor der Übergabe an die Block-Komponente – secure-by-default, unabhängig
  davon, ob der Block-Autor selbst `sanitizeRichText` aufruft.

### Patch Changes

- Updated dependencies [d86168c]
  - @editkraft/schema@0.3.0

## 0.3.0

### Minor Changes

- Editor-Fundament: neue postMessage-Nachricht `ek:schema` (Preview liefert die
  Block-Feld-Deskriptoren ans Studio), `Registry.descriptors()`, `EditkraftPreview`
  sendet das Schema beim Mount. Neues signiertes Draft-Token (`createDraftToken`/
  `verifyDraftToken`, HMAC via Web Crypto) für cookie-freie Preview; `editkraft init`
  generiert die Preview-Route jetzt token-gegated (ENV `EDITKRAFT_PREVIEW_SECRET`).

### Patch Changes

- Updated dependencies
  - @editkraft/schema@0.2.0

## 0.2.1

### Patch Changes

- Preview-Fixes aus dem End-to-End-Test:
  - `createRevalidateHandler` importiert `next/cache` jetzt lazy zur Laufzeit, damit
    der statische Modulgraph von `@editkraft/react` in Client-nahen Bäumen sauber
    bleibt (sonst „revalidateTag only works in a Server Component").
  - `editkraft init` generiert die Preview jetzt als Server-Route + separaten
    Client-Wrapper (`preview-client.tsx`); die Registry wird client-seitig
    importiert und nicht mehr über die Server→Client-Grenze gereicht.

## 0.2.0

### Minor Changes

- Preview-Bridge: `EditkraftPreview` (Client-Komponente, Import über
  `@editkraft/react/preview`) rendert Draft-Content mit Klick-Overlays und spricht
  das postMessage-Protokoll mit dem Studio (`ek:ready`/`ek:tree` senden,
  `ek:update`/`ek:select` empfangen, Origin-Check). Neu: `loadDraftContent`
  (Draft-Loader für den Draft Mode) sowie die Tree-Utilities `updateBlockProps`
  und `findBlock`.

## 0.1.0

### Minor Changes

- Initial release des Renderers: `createRegistry` (Vollständigkeitsprüfung),
  `renderBlocks` (Props-Validierung, unbekannte Typen im Dev als Platzhalter, in
  Production übersprungen + `console.warn`, Slots/children), `EditkraftPage` und
  `loadPublishedPage` (lädt published Content aus der Kunden-Supabase, prüft die
  `schemaVersion` und wirft bei Inkompatibilität `EditkraftSchemaError`),
  `createRevalidateHandler` (Shared-Secret-geschützte, tag-basierte ISR-Revalidation).
