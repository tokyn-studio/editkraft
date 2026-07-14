# @editkraft/react

## 0.8.1

### Patch Changes

- bebe296: The preview now applies incoming `ek:tree` messages: structural edits from
  the Studio (insert / delete / reorder blocks in the layers panel) update the
  canvas live, without saving or reloading. The message was already part of the
  protocol; older previews ignored it silently.

## 0.8.0

### Minor Changes

- be50169: Collections & blog (structured, repeatable content) — plus the reserved
  Symbols table:

  - **`defineCollection`**: structured fields (same ek-primitives as blocks) +
    richText body; items travel the preview protocol as synthetic
    `$collection:<slug>` blocks, so the entire inline-editing bridge works for
    articles unchanged. New helpers: `validateItemData`, `itemToBlock`,
    `isCollectionBlockType`, `collectionSlugOfBlockType`.
  - **Renderer**: `getCollection()` / `getCollectionItem()` (published-only,
    locale fallback) for list and detail routes; the registry accepts
    `{ collection, template }` entries.
  - **CLI**: `ek_collections`/`ek_collection_items` migration (snapshot
    publish, published-only RLS), the read-only **`editkraft scan`** command
    (detects frontmatter folders and uniform object arrays, suggests a field
    schema, `--json` for agents), preview-route template gains the item mode
    (`?collection=&item=`), and MIGRATE.md documents the collections playbook.
  - **CLI**: reserved `ek_symbols` migration (Roadmap 2.4 contract prep,
    unused in v1).

### Patch Changes

- Updated dependencies [be50169]
  - @editkraft/schema@0.7.0

## 0.7.0

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

### Patch Changes

- Updated dependencies [b72d0a5]
  - @editkraft/schema@0.6.0

## 0.6.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [3a25858]
  - @editkraft/schema@0.5.0

## 0.5.3

### Patch Changes

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

## 0.5.2

### Patch Changes

- 55d1a25: Fixes two multi-locale bugs found while verifying Roadmap 1.4 against a real
  PostgREST: both broke as soon as a slug had 2+ locale rows, which is the
  normal state right after using the translation feature.

  - **`loadDraftContent` had no locale filter at all.** `.eq("slug",
slug).maybeSingle()` threw PostgREST's `PGRST116` ("multiple ... rows
    returned") once any two locales shared a slug, and the error was silently
    swallowed — the customer's live-preview route 404'd for _every_ locale of
    that slug, not just the newly created translation. `loadDraftContent` now
    accepts the same `locale`/`defaultLocale` options as `loadPublishedPage`,
    and a real query error is thrown instead of swallowed.
  - **`loadPublishedPage` without `options.locale` also threw on multi-row.**
    Legacy callers (every pre-0.5 customer route, and the CLI's scaffolded
    `[slug]/page.tsx`) call it with no `locale` — once two published locales
    exist for one slug, the unfiltered query now hits the same PGRST116 and the
    route 500s.

  **Decided no-locale semantics (applies to both `loadPublishedPage` and
  `loadDraftContent`, and to `getAlternateLocales`'s identify query, which had
  the same hazard):** without `options.locale`, rows are ordered by `locale`
  ascending and the first is taken deterministically (`.order("locale", {
ascending: true }).limit(1)`), instead of throwing or silently guessing
  `defaultLocale` — the function has no way to know a `defaultLocale`
  preference without the option. **Multi-locale sites should pass
  `options.locale` explicitly** rather than relying on this fallback.

  If you're on a multi-locale site (2+ rows sharing a slug), upgrade the
  customer route to pass `locale` — see the updated `[slug]/page.tsx` and
  `editkraft/preview/[[...slug]]/page.tsx` in `apps/example` for the pattern.

## 0.5.1

### Patch Changes

- f1e4cbf: The image popover can open the studio's asset library via a raw `ek:library-open` message, sitting alongside the existing crop and AI-editor actions and following the same origin discipline as `ek:ai-edit-open`.

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
