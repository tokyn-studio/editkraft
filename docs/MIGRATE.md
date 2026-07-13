# Migrating an existing site to Editkraft

**Audience: coding agents** (Claude Code, Cursor, …) working in the customer's
repo — and the developers driving them. This playbook turns an existing
Next.js site into an Editkraft-managed site **page by page, pixel-identical,
in all languages**, so that the moment the site is connected in the Studio,
everything is already editable.

Run it right after `npx editkraft init` — it does NOT require the Studio
connection: content is seeded into the customer's own Supabase with the local
service key. Connect the Studio afterwards and start editing immediately.

## The contract (non-negotiable rules)

1. **Blocks wrap the site's existing components.** Never rebuild markup —
   import the site's section/brand components and reuse their exact classes.
   Pixel parity is the acceptance criterion.
2. **`data-ek-field="<propName>"` on every editable element.** The Studio
   edits exclusively inline; a block without the attribute renders but cannot
   be edited. For components that only take `children`, pass
   `<span data-ek-field="…">` through.
3. **Props are ek-primitives only** (`ekText`, `ekText({multiline})`,
   `ekRichText`, `ekImage`, `ekLink`, each optionally `.optional()`).
   - Object arrays (cards, rows) → parent block with `slots` + child blocks.
   - Paragraph/bullet lists → ONE `ekRichText` field with `<p>`/list tags
     (`ekList` is not inline-editable).
   - No boolean/enum → model variants as separate child-block types
     (e.g. `MetricTile` / `MetricTileHighlight`).
4. **i18n:** one `ek_pages` row per locale, same `slug`, shared
   `translation_group_id`. Set `locales`/`defaultLocale` in
   `editkraft.config.ts`. If the app uses locale segments (next-intl):
   move `app/[...slug]` under the locale segment, pass `locale` to
   `<EditkraftPage>`, and **exclude `editkraft` from the middleware matcher**
   (the Studio preview iframe must not be locale-redirected).
5. **Preview needs the app's context.** The preview route lives outside the
   app's layout segments — wrap `<EditkraftPreview>` in
   `app/editkraft/preview/preview-client.tsx` with whatever providers the
   blocks need (next-intl, theme, …), or editing fails silently.

## The process

1. **Inventory.** Classify every route: *content page* (text/media sections)
   vs *app page* (forms, interactive tools, data-driven collections). Only
   content pages migrate; app pages stay code. Pages mixing both need
   restructuring first — report them instead of forcing it.
2. **Baseline.** Before touching anything, capture every content page in
   every locale: full-page screenshot + HTML. This is the diff reference —
   without it you cannot prove pixel parity after cutover.
3. **Block catalog.** Map each page's sections to blocks. Deduplicate hard:
   structurally identical sections across pages share ONE block type.
4. **Implement blocks** (+ register in `blocks/registry.ts`). Typecheck,
   lint, and the project's tests must stay green.
5. **Seed.** Write an idempotent script per page (or one for all) that reads
   the existing content source (i18n message files, MDX, hardcoded JSX →
   convert to richText HTML) and builds the block tree; insert one
   `ek_pages` row per locale (shared `translation_group_id`) plus one
   `ek_page_versions` row. Use stable block ids (no randomness). Status
   stays `draft` — publishing is a human decision.
   **Assets:** upload images used by migrated pages into the `ek-assets`
   storage bucket and insert matching `ek_assets` rows — only then can the
   Studio's asset picker manage them. Reference them in `ekImage` props as
   `{ assetId, url }`. Add the Supabase hostname to `next/image`
   `remotePatterns`. Site-wide statics (logo, favicons, OG images) stay in
   `public/`.
6. **Verify before cutover.** Render the preview route with a signed token
   (`createDraftToken`) and compare against the live page. Publish (set
   `published_version_id` + `status`) only when it matches.
7. **Cut over one page at a time.** Replace the static route with the
   Editkraft render route (root pages and routes with special metadata keep
   a thin code wrapper that renders `<EditkraftPage>` with a fixed slug).
   Place the catch-all inside the route group / layout segment that carries
   the site chrome (header, footer), so CMS pages inherit it.
   Deploy, then diff the live page against the baseline: extracted text must
   be identical, screenshots must match. Keep the old page components in the
   repo until the diff is proven — rollback is then a one-commit revert.

## Known traps (each cost us real debugging time)

- Package managers with release-age gates (pnpm `minimumReleaseAge`) silently
  resolve outdated Editkraft versions — pin the versions from npm explicitly.
- Supabase keys: copy the service key from the **dashboard** (Project
  Settings → API keys).
- `sanitizeRichText` allows `strong/em/u/s/a[href]/p/h2/h3` — content using
  `<br>`, `<code>` or `a[target]` needs a block-local sanitizer for now.
- After changing `NEXT_PUBLIC_*` values: rebuild/restart — they are inlined.
- The Studio publishes the **whole translation group** on Publish and
  implicitly saves the current preview state; seeds should therefore keep
  every locale's draft in a publishable state.

## What NOT to migrate

Forms, interactive tools, live widgets, data-driven collections (blog
listings, search, generated pages). They stay code. A page whose flow mixes
content sections with interactive code sections needs "code-slot" support —
not available yet; leave such pages as code and say so in your report.

Also keep in code (for now) and report as "stays code":

- **Site globals** (contact data, claim, footer lines living in a settings
  module) — Editkraft has no Studio management for them yet.
- **Icon/variant keys**: there is no select primitive; if a key must be
  editable, use `ekText` and render a safe fallback for unknown values.
- **Legal-style rich content** needing headings/lists beyond the sanitizer
  allowlist — either a block-local sanitizer or keep the existing format.
