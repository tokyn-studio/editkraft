-- RLS-Fixture für die Editkraft-Kunden-Migration.
-- Beweist: anon/authenticated lesen NUR published Content; service_role/postgres
-- sieht alles. Setzt voraus, dass die Editkraft-Migration angewandt ist.
--
-- Ausführen gegen ein Supabase-Postgres (mit Rollen anon/authenticated):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f rls.fixture.sql
-- Läuft in einer Transaktion mit ROLLBACK – hinterlässt keine Daten.

begin;

-- --- i18n contract (Roadmap 1.4) — applied so RLS tests run against the
-- end state (locale + translation_group_id + unique(slug, locale)). --------
alter table public.ek_pages
  add column if not exists locale text not null default 'de';

alter table public.ek_pages
  add column if not exists translation_group_id uuid not null default gen_random_uuid();

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

-- --- Seed (als postgres/service, umgeht RLS) --------------------------------
insert into public.ek_pages (id, slug, title, status) values
  ('00000000-0000-4000-8000-000000000d01', 'draft-page', 'Nur Draft', 'draft'),
  ('00000000-0000-4000-8000-000000000f01', 'pub-page', 'Veröffentlicht', 'published');

insert into public.ek_page_versions (id, page_id, content, schema_version) values
  ('00000000-0000-4000-8000-000000000a01',
   '00000000-0000-4000-8000-000000000f01',
   '{"schemaVersion":"0.1.0","blocks":[]}', '0.1.0'),
  -- neuere, unveröffentlichte Draft-Version derselben Seite:
  ('00000000-0000-4000-8000-000000000a02',
   '00000000-0000-4000-8000-000000000f01',
   '{"schemaVersion":"0.1.0","blocks":[]}', '0.1.0'),
  -- Version der reinen Draft-Seite:
  ('00000000-0000-4000-8000-000000000a03',
   '00000000-0000-4000-8000-000000000d01',
   '{"schemaVersion":"0.1.0","blocks":[]}', '0.1.0');

update public.ek_pages
  set published_version_id = '00000000-0000-4000-8000-000000000a01'
  where id = '00000000-0000-4000-8000-000000000f01';

-- --- anon: sieht NUR die published Seite und deren published Version ---------
set local role anon;
do $$
begin
  assert (select count(*) from public.ek_pages) = 1,
    'anon muss genau 1 (published) Seite sehen';
  assert (select slug from public.ek_pages) = 'pub-page',
    'anon sieht die veröffentlichte Seite';
  assert (select count(*) from public.ek_page_versions) = 1,
    'anon sieht nur die published Version, nicht den neueren Draft';
  assert (select id from public.ek_page_versions)
      = '00000000-0000-4000-8000-000000000a01',
    'anon sieht genau die published_version';
end $$;
reset role;

-- --- authenticated: identisch (nur published) -------------------------------
set local role authenticated;
do $$
begin
  assert (select count(*) from public.ek_pages) = 1,
    'authenticated sieht nur published';
  assert (select count(*) from public.ek_page_versions) = 1,
    'authenticated sieht nur published Version';
end $$;
reset role;

-- --- service/postgres: sieht alles (Draft + Published) ----------------------
do $$
begin
  assert (select count(*) from public.ek_pages) = 2,
    'service sieht Draft und Published';
  assert (select count(*) from public.ek_page_versions) = 3,
    'service sieht alle Versionen';
end $$;

-- Schreibversuch als anon muss scheitern (kein Grant/Policy)
set local role anon;
do $$
begin
  begin
    insert into public.ek_pages (slug, title, status) values ('hack', 'Hack', 'published');
    raise exception 'anon durfte NICHT schreiben';
  exception
    when insufficient_privilege then null; -- erwartet
  end;
end $$;
reset role;

rollback;

\echo 'RLS-Fixture: OK – anon/authenticated lesen nur published, Schreiben verweigert.'
