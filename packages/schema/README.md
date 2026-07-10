# @editkraft/schema

The Editkraft contract: block tree format, field primitives, Zod schemas, and
the Studio ⇄ preview `postMessage` protocol. Dependency-light (only Zod), no
React or Next.js dependency — shared by the renderer, the CLI, and the Studio.

## What's in here

- **Field primitives** (`ekText`, `ekRichText`, `ekImage`, `ekLink`, `ekColor`,
  `ekList`, `ekReference`) — the building blocks for a block's `props` schema.
  Each carries `EkFieldMeta` (kind, label, …) so tooling can render an editor
  for it without bespoke per-field code.
- **Block definitions** (`defineBlock`, `blockSchema`, `pageContentSchema`,
  `validateBlockProps`) — a `Block` is `{ id, type, props }`; a page's content
  is `{ schemaVersion, blocks }`.
- **Versioning** (`SCHEMA_VERSION`, `isCompatible`, `majorOf`, `migrateContent`,
  `registerMigration`) — content written with an older schema version can be
  migrated forward; compatibility is checked by SemVer range.
- **Row schemas** (`ekPageRowSchema`, `ekPageVersionRowSchema`,
  `ekAssetRowSchema`, `pageStatusSchema`, `pageMetaSchema`) — the shape of the
  `ek_pages` / `ek_page_versions` / `ek_assets` tables that `editkraft init`
  migrates into the customer's Supabase.
- **Draft tokens** (`createDraftToken`, `verifyDraftToken`) — signed,
  short-lived tokens used by the preview route instead of the Draft Mode
  cookie, so preview also works inside a cross-origin iframe.
- **Preview protocol** (`PROTOCOL_VERSION`, `ekSelectMessage`,
  `ekUpdateMessage`, `ekTreeMessage`, `ekFocusFieldMessage`, `parseMessage`,
  `isAllowedOrigin`, …) — the typed `postMessage` events exchanged between the
  Studio and the preview bridge.
- **Rich text** (`sanitizeRichText`, `RICH_TEXT_ALLOWLIST`) — the allowed tag
  set and sanitizer for rich-text field values, applied centrally by the
  renderer so every consumer is secure by default.

## Breaking-change rule

Any change that invalidates an existing block tree, or changes the behavior of
a field primitive, is a **major release**. The Studio declares
`supportedSchemaVersions` as a SemVer range — this discipline is the entire
sync mechanism between the renderer, the CLI, and the Studio. See
[`docs/CONTRACT.md`](../../docs/CONTRACT.md) and
[`docs/DECISIONS.md`](../../docs/DECISIONS.md) in the repo root for the full
contract and the reasoning behind each decision.

## License

MIT
