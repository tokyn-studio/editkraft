/**
 * SQL-Migration für die Kunden-Supabase. Tabellen mit Prefix `ek_`.
 *
 * RLS-Prinzip: anon/authenticated lesen AUSSCHLIESSLICH published Content
 * (Join über published_version_id). Alle Schreibzugriffe und Draft-Reads laufen
 * über service_role (die das Studio bzw. der Draft Mode serverseitig nutzt) –
 * service_role umgeht RLS, deshalb bekommt es keine eigenen Policies.
 *
 * Idempotent: `if not exists`, `drop policy if exists`, `on conflict do nothing`.
 */
export function migrationSql(): string {
  return `-- Editkraft: Content-Tabellen im Kundenprojekt (Prefix ek_).
-- Erzeugt von: editkraft init

-- Status-Enum (idempotent)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ek_page_status') then
    create type public.ek_page_status as enum ('draft', 'published');
  end if;
end $$;

-- updated_at-Trigger-Funktion
create or replace function public.ek_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- ek_pages
-- ---------------------------------------------------------------------------
create table if not exists public.ek_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  meta jsonb not null default '{}'::jsonb,
  status public.ek_page_status not null default 'draft',
  published_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ek_pages_set_updated_at on public.ek_pages;
create trigger ek_pages_set_updated_at before update on public.ek_pages
  for each row execute function public.ek_set_updated_at();

-- ---------------------------------------------------------------------------
-- ek_page_versions (append-only; jede Speicherung ist eine neue Version)
-- ---------------------------------------------------------------------------
create table if not exists public.ek_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.ek_pages (id) on delete cascade,
  content jsonb not null,
  schema_version text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists ek_page_versions_page_id_idx
  on public.ek_page_versions (page_id);

-- FK erst nach ek_page_versions setzbar (published_version_id -> version)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ek_pages_published_version_fk'
  ) then
    alter table public.ek_pages
      add constraint ek_pages_published_version_fk
      foreign key (published_version_id)
      references public.ek_page_versions (id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ek_assets
-- ---------------------------------------------------------------------------
create table if not exists public.ek_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  alt text,
  width int,
  height int,
  mime_type text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Storage-Bucket für Assets (public: veröffentlichte Bilder sind öffentlich)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ek-assets', 'ek-assets', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: anon/authenticated lesen NUR published Content.
-- Schreiben & Draft-Reads laufen über service_role (umgeht RLS).
-- ---------------------------------------------------------------------------
alter table public.ek_pages enable row level security;
alter table public.ek_page_versions enable row level security;
alter table public.ek_assets enable row level security;

grant select on public.ek_pages to anon, authenticated;
grant select on public.ek_page_versions to anon, authenticated;
grant select on public.ek_assets to anon, authenticated;

drop policy if exists "ek public reads published pages" on public.ek_pages;
create policy "ek public reads published pages"
  on public.ek_pages for select
  to anon, authenticated
  using (status = 'published' and published_version_id is not null);

drop policy if exists "ek public reads published versions" on public.ek_page_versions;
create policy "ek public reads published versions"
  on public.ek_page_versions for select
  to anon, authenticated
  using (
    id in (
      select published_version_id from public.ek_pages
      where status = 'published' and published_version_id is not null
    )
  );

drop policy if exists "ek public reads assets" on public.ek_assets;
create policy "ek public reads assets"
  on public.ek_assets for select
  to anon, authenticated
  using (true);
`;
}
