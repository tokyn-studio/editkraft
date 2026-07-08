# @editkraft/schema

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
