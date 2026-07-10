---
"@editkraft/schema": minor
---

Add the locale contract from Roadmap 1.4. This lands later than planned, but additively:

- `ekPageRowSchema` gains `locale` (BCP-47 tag, min length 2) and `translation_group_id`
  (uuid); pages that share a `translation_group_id` are translations of one another.
- On the database side this replaces `unique(slug)` on `ek_pages` with
  `unique(slug, locale)` — same slug is now allowed across different locales.

Both columns ship with defaults, so existing rows stay valid without a backfill.
Existing projects pick up the new columns and constraint by running the second
migration, `supabase/migrations/*_editkraft_i18n.sql` (added by `editkraft` 0.2.0) —
re-run `editkraft init` to generate it.
