---
"@editkraft/react": patch
---

Fixes two multi-locale bugs found while verifying Roadmap 1.4 against a real
PostgREST: both broke as soon as a slug had 2+ locale rows, which is the
normal state right after using the translation feature.

- **`loadDraftContent` had no locale filter at all.** `.eq("slug",
  slug).maybeSingle()` threw PostgREST's `PGRST116` ("multiple ... rows
  returned") once any two locales shared a slug, and the error was silently
  swallowed — the customer's live-preview route 404'd for *every* locale of
  that slug, not just the newly created translation. `loadDraftContent` now
  accepts the same `locale`/`defaultLocale` options as `loadPublishedPage`,
  and a real query error is thrown instead of swallowed.
- **`loadPublishedPage` without `options.locale` also threw on multi-row.**
  Legacy callers (every pre-0.5 customer route, and the CLI's scaffolded
  `[slug]/page.tsx`) call it with no `locale` — once two published locales
  exist for one slug, the unfiltered query now hits the same PGRST116 and the
  route 500s.

**Decided no-locale semantics (applies to both `loadPublishedPage` and
`loadDraftContent`, and to `getAlternateLocales`'s identify query, which had
the same hazard):** without `options.locale`, rows are ordered by `locale`
ascending and the first is taken deterministically (`.order("locale", {
ascending: true }).limit(1)`), instead of throwing or silently guessing
`defaultLocale` — the function has no way to know a `defaultLocale`
preference without the option. **Multi-locale sites should pass
`options.locale` explicitly** rather than relying on this fallback.

If you're on a multi-locale site (2+ rows sharing a slug), upgrade the
customer route to pass `locale` — see the updated `[slug]/page.tsx` and
`editkraft/preview/[[...slug]]/page.tsx` in `apps/example` for the pattern.
