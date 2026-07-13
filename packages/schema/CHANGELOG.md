# @editkraft/schema

## 0.5.0

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

## 0.4.0

### Minor Changes

- 9492038: Add the locale contract from Roadmap 1.4. This lands later than planned, but additively:

  - `ekPageRowSchema` gains `locale` (BCP-47 tag, min length 2) and `translation_group_id`
    (uuid); pages that share a `translation_group_id` are translations of one another.
  - On the database side this replaces `unique(slug)` on `ek_pages` with
    `unique(slug, locale)` — same slug is now allowed across different locales.

  Both columns ship with defaults, so existing rows stay valid without a backfill.
  Existing projects pick up the new columns and constraint by running the second
  migration, `supabase/migrations/*_editkraft_i18n.sql` (added by `editkraft` 0.2.0) —
  re-run `editkraft init` to generate it.

- 103a10f: Rich-text formatting, link editing and image tools in the live preview:

  - Schema: rich-text allowlist extended by p/h2/h3/u/s; `ekImageValue.frame`
    (non-destructive 1:1 framing) plus `imageFrameStyles()` as a shared render
    helper for preview and published pages
  - React: floating formatting toolbar (B/I/U/S, paragraph/H2/H3, links),
    link popover (URL/mail/tel, button and inline links), image popover
    (replace, crop/frame, AI-edit hook), all wired through the existing
    postMessage bridge

## 0.3.0

### Minor Changes

- d86168c: Direct Manipulation im Preview: neue `ek:focus-field`-Nachricht, `ek:update` als
  bidirektionales Protokoll dokumentiert, dependency-freier `sanitizeRichText` +
  `RICH_TEXT_ALLOWLIST` (RichText-Speicherformat = sanitisiertes HTML-Subset).
  Renderer/Preview-Bridge macht `data-ek-field`-Elemente inline editierbar
  (contentEditable, Mini-Toolbar für RichText, Bild-Klick → `ek:focus-field`).
  Der Renderer (`renderBlocks`/`EditkraftPage`) sanitisiert `richText`-Props jetzt
  zentral vor der Übergabe an die Block-Komponente – secure-by-default, unabhängig
  davon, ob der Block-Autor selbst `sanitizeRichText` aufruft.

## 0.2.0

### Minor Changes

- Editor-Fundament: neue postMessage-Nachricht `ek:schema` (Preview liefert die
  Block-Feld-Deskriptoren ans Studio), `Registry.descriptors()`, `EditkraftPreview`
  sendet das Schema beim Mount. Neues signiertes Draft-Token (`createDraftToken`/
  `verifyDraftToken`, HMAC via Web Crypto) für cookie-freie Preview; `editkraft init`
  generiert die Preview-Route jetzt token-gegated (ENV `EDITKRAFT_PREVIEW_SECRET`).

## 0.1.0

### Minor Changes

- Initial release des Editkraft-Contracts: Blocktree-Format (`Block`, `PageContent`),
  Feld-Primitives (`ekText`, `ekRichText`, `ekImage`, `ekLink`, `ekColor`, `ekList`,
  `ekReference`) mit serialisierbaren Metadaten, `defineBlock`, DB-Row-Schemas
  (`ek_pages`, `ek_page_versions`, `ek_assets`), Versions-Utilities
  (`SCHEMA_VERSION`, `satisfies`, `isCompatible`, `migrateContent`) und das
  postMessage-Protokoll (`ek:ready` | `ek:select` | `ek:update` | `ek:tree`).
