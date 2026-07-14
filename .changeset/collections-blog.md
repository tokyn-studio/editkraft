---
"@editkraft/schema": minor
"@editkraft/react": minor
"editkraft": minor
---

Collections & blog (structured, repeatable content) — plus the reserved
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
