# @editkraft/schema

## 0.1.0

### Minor Changes

- Initial release des Editkraft-Contracts: Blocktree-Format (`Block`, `PageContent`),
  Feld-Primitives (`ekText`, `ekRichText`, `ekImage`, `ekLink`, `ekColor`, `ekList`,
  `ekReference`) mit serialisierbaren Metadaten, `defineBlock`, DB-Row-Schemas
  (`ek_pages`, `ek_page_versions`, `ek_assets`), Versions-Utilities
  (`SCHEMA_VERSION`, `satisfies`, `isCompatible`, `migrateContent`) und das
  postMessage-Protokoll (`ek:ready` | `ek:select` | `ek:update` | `ek:tree`).
