# Migrating an existing site to Editkraft

**Audience: coding agents** (Claude Code, Cursor, …) working in the customer's
repo — and the developers driving them. This playbook turns an existing
Next.js site into an Editkraft-managed site **page by page, pixel-identical,
in all languages**, so that the moment the site is connected in the Studio,
everything is already editable.

Run it right after `npx editkraft init` — it does NOT require the Studio
connection: content is seeded into the customer's own Supabase with the local
service key. Connect the Studio afterwards and start editing immediately.

For deployed sites the order is strict: **deploy the migrated code (with the
Supabase ENV already set in the hosting project) → connect the site in the
Studio → set the three Studio secrets in the hosting project → redeploy.**
Connecting before the code is deployed leaves the Studio pointing at a site
without the preview route — the editor then shows the site's 404 page.

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
6. **The preview MUST show the site chrome (header + footer).** They usually
   live in a route-group layout (`(site)/layout.tsx`) that the preview route
   does not inherit — so render them in the preview page around the content,
   wrapped in a `pointer-events-none` container: visible for editing context,
   but link clicks must not navigate the iframe away. **A migration is not
   done while the editor canvas shows naked content blocks without header and
   footer.**

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
   (`createDraftToken`) and compare against the live page. The comparison
   includes the chrome: **the preview must show the page inside the real
   header and footer** (contract rule 6) — if the canvas shows naked blocks,
   wire the chrome into `app/editkraft/preview/` first. Publish (set
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
- **Forgotten site chrome:** if the preview route renders only the blocks,
  editors see the page without header/footer and lose all context. Wrap the
  real header and footer around the preview content (`pointer-events-none`) —
  this is contract rule 6 and part of the cutover verification, not optional.
- The Studio publishes the **whole translation group** on Publish and
  implicitly saves the current preview state; seeds should therefore keep
  every locale's draft in a publishable state.

## What NOT to migrate

Forms, interactive tools, live widgets, data-driven collections (blog
listings, search, generated pages). They stay code. A page whose flow mixes
content sections with interactive code sections needs "code-slot" support —
not available yet; leave such pages as code and say so in your report.

Also keep in code (for now) and report as "stays code":

- **Icon/variant keys**: there is no select primitive; if a key must be
  editable, use `ekText` and render a safe fallback for unknown values.
- **Legal-style rich content** needing headings/lists beyond the sanitizer
  allowlist — either a block-local sanitizer or keep the existing format.

## Images that can become videos

Any `ekImage` field can carry a **video** instead of a picture (schema ≥ 0.9 /
react ≥ 0.10). The field type stays `image` — only the stored *value* gains an
optional `kind: "video"` — so every existing `data-ek-field` contract keeps
working and old image values (without `kind`) stay images.

To let editors switch a picture to a video (and back), render the field with
`<EkMedia>` instead of a hand-written `<img>`:

```tsx
import { EkMedia } from "@editkraft/react";

function Banner({ image }: { image: EkMediaValue }) {
  return (
    <div data-ek-field="image">
      <EkMedia value={image} className="banner-media" />
    </div>
  );
}
```

`EkMedia` renders an `<img>` for pictures and a muted, looping, autoplaying
`<video playsinline>` for videos (a silent background video; it shows controls
only when the editor ticked "Show controls"). Framing (`imageFrameStyles`) is
applied identically for both. In the Studio the image popover now has an
**Image | Video** switch: editors upload mp4/webm (up to 25 MB) or paste a URL,
optionally set a poster image, and toggle controls.

Existing `<img>` blocks keep working unchanged for images — migrate them to
`<EkMedia>` only where you want the video option.

## Site globals (contact data, claim, footer lines)

Values from a settings module (`settings.ts`) that appear in blocks AND in the
site chrome (header/footer) migrate to **Site globals** (schema ≥ 0.6 /
react ≥ 0.7; `npx editkraft init` ships the `ek_globals` migration — run
`supabase db push`):

1. **Define** them once, with the existing primitives:
   ```ts
   // src/blocks/globals.ts
   export const globals = defineGlobals({
     schema: z.object({
       phone: ekText({ label: "Telefon" }),
       claim: ekText({ label: "Claim" }),
     }),
   });
   ```
2. **Load with code fallback** — the settings module stays as the default, so
   the site renders even before anything is published (or if the table is
   missing): `const values = (await loadGlobals(supabase, globals)) ?? settings;`
   Wrap in React `cache()` to dedupe per request.
3. **Render**: pass `values` as the `globals` option to
   `renderBlocks`/`EditkraftPage` (blocks receive a `globals` prop) and as a
   plain prop to chrome components (header/footer, loaded in the layout).
4. **Mark editable occurrences** with `data-ek-global="<key>"` — the exact
   `data-ek-field` pattern, but for globals (kind `text`/`richText`).
5. **Preview route**: load `loadDraftGlobals(serviceClient, globals)` and pass
   `globals={{ definition: globals, values: draft ?? settings }}` to
   `EditkraftPreview`. Publishing in the Studio then goes live site-wide.

Editing one occurrence (e.g. the phone number in the contact section) updates
every occurrence — contact section and footer can never drift again.
## Collections & blog

Data-driven collections (blog listings, generated detail pages) are the one
exception to "data-driven collections stay code": since Roadmap 2.8 they
migrate into `ek_collections` / `ek_collection_items` instead of `ek_pages`.
An item is **structured fields plus exactly one `ekRichText` body** — not a
block tree. Draft/publish is a snapshot (`published_data`); anon only ever
sees published items.

The process, per collection:

1. **Scan.** Run `npx editkraft scan --json`. It reports candidates: folders
   with 3+ frontmatter `.md`/`.mdx` files and exported uniform object arrays,
   each with a suggested field schema, item count, and a locale guess. The
   report is a starting point, not a verdict — verify the suggested primitives
   against the real content (dates are suggested as `ekText` until a date
   primitive exists).
2. **Define the collection.** `defineCollection({ slug, name, schema })` with
   ek-primitives only, exactly like block props. Model the markdown body as
   ONE `ekRichText` field (conventionally `body`). Insert the collection row
   (`slug`, `name`, serialized `item_schema`) with the service key — the
   seed script can do this idempotently (`on conflict (slug) do nothing`).
3. **Push the migration.** `editkraft init` (re-run is idempotent) writes
   `supabase/migrations/<ts+2s>_editkraft_collections.sql`; apply it with
   `supabase db push`. It is additive and safe on existing installations.
4. **Seed the items.** One idempotent script: frontmatter keys → field
   values, the markdown body → richText **HTML** restricted to the
   `sanitizeRichText`-compatible subset (`strong/em/u/s/a[href]/p/h2/h3`) —
   convert or drop anything else (tables, code blocks, images-in-body) and
   report it. One `ek_collection_items` row per locale, same `slug`, shared
   `translation_group_id`; write `draft_data` only — publishing stays a
   human decision. Use stable slugs (from filenames), set `sort_order` where
   the source has an explicit order. Upload referenced images to `ek-assets`
   and reference them as `{ assetId, url }`, exactly as in step 5 of the page
   process.
5. **Register the item template.** Add the collection to `createRegistry`
   with `{ collection, template }`. The template receives `{ item }` and must
   put `data-ek-field="<fieldName>"` on every editable element — same
   contract as blocks; a field without the attribute renders but cannot be
   edited inline.
6. **Cut the blog routes over.** Listing page: replace the filesystem/array
   read with `getCollection(supabase, "blog", { locale })`. Detail page:
   `getCollectionItem(supabase, "blog", slug, { locale })`, render through
   the registered template, keep `generateStaticParams`/metadata working from
   the item data. Both helpers return published items only — drafts appear
   exclusively in the Studio preview.
7. **Verify.** Diff every blog page (listing + each detail page, every
   locale) against the baseline from step 2 of the page process: extracted
   text identical, screenshots matching. Keep the old data source in the repo
   until the diff is proven — rollback stays a one-commit revert.

Out of scope in v1 (report, don't force): taxonomies/categories, scheduled
publishing, per-item version history, cross-item search.
