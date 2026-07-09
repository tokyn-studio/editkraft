# @editkraft/schema

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
