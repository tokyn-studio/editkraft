---
"@editkraft/schema": minor
"@editkraft/react": minor
"editkraft": minor
---

Site globals — site-wide content (contact data, claim, …) defined in code,
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
