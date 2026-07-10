---
"editkraft": minor
---

English-first CLI output plus the i18n contract's upgrade path:

- All CLI output, error messages, and generated READMEs are now in English
  (previously German).
- `editkraft init` now scaffolds a **second** migration,
  `supabase/migrations/*_editkraft_i18n.sql`, one timestamp-second after the init
  migration so it always applies after it. It adds `locale` and
  `translation_group_id` to `ek_pages` (both with defaults) and replaces
  `unique(slug)` with `unique(slug, locale)` — additive and idempotent, safe to
  run against an existing installation. Existing projects should re-run
  `editkraft init` to pick it up.
- The generated `editkraft.config.ts` now declares `locales` and `defaultLocale`
  (defaulting to `["de"]` / `"de"`), matching the new `EditkraftConfig` fields in
  `@editkraft/react`.
- The default locale is interpolated into the migration SQL, so it's now validated
  against a strict `[A-Za-z0-9-]+` pattern before being written — an invalid or
  hostile value throws instead of producing broken or injectable SQL.
