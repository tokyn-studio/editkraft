-- Editkraft i18n contract (Roadmap 1.4): locale + translation groups.
-- Additive; safe to run on existing installations.

alter table public.ek_pages
  add column if not exists locale text not null default 'de';

alter table public.ek_pages
  add column if not exists translation_group_id uuid not null default gen_random_uuid();

-- Replace unique(slug) with unique(slug, locale).
-- 'ek_pages_slug_key' is the implicit constraint name from `slug text not null unique`.
alter table public.ek_pages drop constraint if exists ek_pages_slug_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ek_pages_slug_locale_key'
  ) then
    alter table public.ek_pages
      add constraint ek_pages_slug_locale_key unique (slug, locale);
  end if;
end $$;

create index if not exists ek_pages_translation_group_idx
  on public.ek_pages (translation_group_id);
