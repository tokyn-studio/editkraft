---
"@editkraft/react": minor
---

Locale-aware rendering for the Roadmap 1.4 contract, plus English-first messages:

- `loadPublishedPage` accepts `locale` and `defaultLocale` in its options. With
  `locale` set, the lookup is narrowed to that locale; if no published page exists
  for it and `defaultLocale` differs, it falls back to `defaultLocale`. Without
  either option, behavior is unchanged. The returned `PublishedPage` now includes
  `locale`.
- New `getAlternateLocales(supabase, slug, locale?)` returns every published
  translation of a page (siblings sharing `translation_group_id`) for building
  `hreflang` alternates.
- New `getSitemapEntries(supabase)` returns every published page's slug, locale,
  and last-updated timestamp across all locales, for building a sitemap.
- `EditkraftPageProps` gains `locale` and `defaultLocale`, forwarded to
  `loadPublishedPage`. `EditkraftConfig` gains optional `locales` and
  `defaultLocale` fields.
- All thrown/logged error messages in the data loader and `EditkraftPage` are now
  in English (previously German).
- Restored two side effects the inline-editing refactor had silently dropped from
  image-field selection: the `ek:focus-field` postMessage after an image-field
  `ek:select`, and the `data-editkraft-selected` DOM attribute mirroring the
  current selection. Both use the same imperative, non-re-rendering mechanism the
  refactor introduced, so contentEditable fields still don't lose their cursor on
  selection change.
