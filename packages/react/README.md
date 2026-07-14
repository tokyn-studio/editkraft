# @editkraft/react

The Editkraft renderer for Next.js: block registry, `EditkraftPage`, the ISR
revalidate handler, and the draft preview bridge.

## Install

```bash
pnpm add @editkraft/react @editkraft/schema zod
```

Peer dependencies: `react >= 18`, `next >= 14` (App Router), `@supabase/supabase-js` v2.

## Registry

Pair each block definition with its React component:

```ts
import { createRegistry } from "@editkraft/react";
import { defineBlock, ekText, ekImage } from "@editkraft/schema";
import { z } from "zod";
import { Hero } from "./Hero";

export const registry = createRegistry([
  {
    definition: defineBlock({
      type: "Hero",
      label: "Hero section",
      schema: z.object({
        headline: ekText({ label: "Headline" }),
        image: ekImage({ label: "Image" }),
      }),
    }),
    component: Hero,
  },
]);
```

`createRegistry` validates that every block type has both a definition (with a
schema) and a component.

## Inline editing: `data-ek-field`

The Studio edits **exclusively inline** in the live preview — there is no
property panel. A block opts its elements into editing with
`data-ek-field="<propName>"`:

```tsx
export function Hero({ headline, cta }: { headline: string; cta?: EkLinkValue }) {
  return (
    <section>
      <h1 data-ek-field="headline">{headline}</h1>
      {cta ? <a data-ek-field="cta" href={cta.href}>{cta.label}</a> : null}
    </section>
  );
}
```

- `text`/`richText` fields become contenteditable (richText gets a formatting
  toolbar), `link` fields get a link popover, `image` fields open the asset
  picker, `select` fields open an options popover (see below).
- richText supports headings, bold/italic/underline/strikethrough, links and —
  via the toolbar — bullet/numbered lists and blockquotes. The sanitizer also
  keeps `code`, `br`, `hr` and `target="_blank"` on links (with enforced
  `rel="noopener noreferrer"`); everything else is stripped.
- A block **without** `data-ek-field` renders normally but cannot be edited —
  the most common mistake when writing new blocks.
- Repeating structures (card grids, rows) are modelled as a parent block with
  `slots` plus child blocks — not as object arrays (`ekList` accepts primitive
  lists only and is not inline-editable; prefer one `ekRichText` field for
  paragraph lists).

## Select fields: `ekSelect`

`ekSelect` models a strict choice from fixed values (icon keys, layout
variants, …). In the preview, clicking the element opens an options popover —
no free-text editing. Rendering the value stays in the block; always keep a
fallback for unknown values:

```tsx
import { defineBlock, ekSelect, ekText } from "@editkraft/schema";
import { z } from "zod";

const featureDefinition = defineBlock({
  type: "Feature",
  label: "Feature",
  schema: z.object({
    icon: ekSelect({
      label: "Icon",
      options: [
        { value: "bolt", label: "Lightning" },
        { value: "shield", label: "Shield" },
        { value: "star" }, // label optional — the popover shows the value
      ],
    }),
    title: ekText({ label: "Title" }),
  }),
});

const icons: Record<string, ReactNode> = { bolt: <BoltIcon />, shield: <ShieldIcon />, star: <StarIcon /> };

export function Feature({ icon, title }: { icon: string; title: string }) {
  return (
    <div>
      {/* Fallback rendering: unknown key → default icon instead of a crash */}
      <span data-ek-field="icon">{icons[icon] ?? <StarIcon />}</span>
      <h3 data-ek-field="title">{title}</h3>
    </div>
  );
}
```

Validation is a strict enum over the option values; selecting an option in the
preview writes the value immediately (no debounce).

## Rendering a page

```tsx
import { EditkraftPage } from "@editkraft/react";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const supabase = createServerClient(/* ... */);
  return (
    <EditkraftPage
      supabase={supabase}
      slug={(await params).slug}
      registry={registry}
    />
  );
}
```

`EditkraftPage` loads the published page from the customer's Supabase and
renders its block tree through the registry. If no published page exists it
throws `EditkraftError` with code `PAGE_NOT_FOUND` — or pass `notFound` to
render a fallback instead of throwing. On an incompatible `schemaVersion` it
throws `EditkraftSchemaError` with a clear upgrade/migration message.

Read directly with `loadPublishedPage` / `loadDraftContent` when
you need more control than the `EditkraftPage` component provides.

## Revalidate handler

```ts
// app/api/editkraft/revalidate/route.ts
import { createRevalidateHandler } from "@editkraft/react";

export const POST = createRevalidateHandler({
  secret: process.env.EDITKRAFT_REVALIDATE_SECRET,
});
```

Call this endpoint from a Supabase webhook on publish; it's secured with a
shared secret and invalidates the ISR cache tag for the affected page
(`pageTag(slug)`).

## Collections

Collections model structured item types like a blog: items with fixed fields
(ek primitives) plus a richText body, stored in `ek_collections` /
`ek_collection_items`. Define the collection in `@editkraft/schema` and
register it together with an item template:

```tsx
import { defineCollection, ekImage, ekRichText, ekText } from "@editkraft/schema";
import { createRegistry } from "@editkraft/react";
import { z } from "zod";

export const blog = defineCollection({
  slug: "blog",
  name: "Blog",
  schema: z.object({
    title: ekText({ label: "Title" }),
    cover: ekImage({ label: "Cover" }).optional(),
    body: ekRichText({ label: "Body" }),
  }),
});

// Template: receives { item } and marks fields with data-ek-field —
// exactly like a block component.
export function Article({ item }: { item: { title: string; body: string } }) {
  return (
    <article>
      <h1 data-ek-field="title">{item.title}</h1>
      <div data-ek-field="body" dangerouslySetInnerHTML={{ __html: item.body }} />
    </article>
  );
}

export const registry = createRegistry([
  // ...block entries...
  { collection: blog, template: Article },
]);
```

`createRegistry` validates collection entries (template present, unique slug,
no collision with block types) and exposes them via
`registry.getCollection(slug)`. Internally each collection is also registered
as a synthetic block type `"$collection:<slug>"`, which is how the preview
bridge edits items inline without a second code path.

Load published items in your routes:

```ts
import { getCollection, getCollectionItem } from "@editkraft/react";

// List: published items only, ordered sort_order (nulls last), then published_at desc.
const posts = await getCollection(supabase, "blog", {
  locale: "de",
  defaultLocale: "de",
  limit: 20,            // optional
  // order: { column: "published_at", ascending: false },  // optional override
});
// → { id, slug, locale, data, publishedAt, sortOrder }[]

// Detail: one published item or null. Same locale fallback as loadPublishedPage.
const post = await getCollectionItem(supabase, "blog", params.slug, {
  locale: "de",
  defaultLocale: "de",
});
```

For the Studio's item mode, the scaffolded preview route builds a synthetic
one-block tree with `itemToBlock(collectionSlug, itemId, draftData)` (from
`@editkraft/schema`) and passes it to `EditkraftPreview` as regular `content`
— inline editing, toolbar and popovers work unchanged.

## Preview bridge

`@editkraft/react/preview` exports `EditkraftPreview`, a client component used
by the draft preview route (scaffolded by `editkraft init`). It renders draft
content, overlays click targets over registered blocks, and exchanges
`postMessage` events with the Studio (selection, live prop updates, inline
rich-text editing, image cropping).

## Errors

All thrown errors are instances of `EditkraftError` with a stable `code`:
`REGISTRY_INVALID`, `SCHEMA_INCOMPATIBLE`, `PAGE_NOT_FOUND`, `CONTENT_INVALID`.
None of them are silent — each carries an actionable message.

## License

MIT
