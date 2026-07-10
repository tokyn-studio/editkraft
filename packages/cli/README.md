# editkraft

The Editkraft CLI: `init` and `doctor` for Next.js projects with Supabase.

## Usage

```bash
npx editkraft init      # sets up Editkraft in the current project
npx editkraft doctor    # checks migration state, ENV, and registry consistency
```

```
editkraft – visual CMS for Next.js + Supabase

Usage:
  npx editkraft <command> [options]

Commands:
  init      Sets up Editkraft in the current project (migration, config, registry, routes)
  doctor    Checks migration state, ENV, and registry consistency

Options:
  --yes, -y     Non-interactive (accepts defaults)
  --force       Overwrite existing files
  --cwd <dir>   Target directory (default: current)
  --help, -h    Show this help
```

## `init`

Scaffolds everything a Next.js App Router project needs to host Editkraft content:

- `supabase/migrations/<timestamp>_editkraft_init.sql` — content tables (`ek_pages`,
  `ek_page_versions`, `ek_assets`) with published-only RLS.
- `supabase/migrations/<timestamp+1s>_editkraft_i18n.sql` — locale contract
  (`locale`, `translation_group_id`, `unique(slug, locale)`); additive, safe on
  existing installations
- `editkraft.config.ts` — registry path and allowed Studio origin.
- `blocks/registry.ts` + `blocks/Hero.tsx` — an example block registry and component.
- `app/api/editkraft/revalidate/route.ts` — the ISR revalidate webhook handler.
- `app/editkraft/preview/[[...slug]]/page.tsx` + `preview-client.tsx` — the draft
  preview route used by the Studio.
- `.env.editkraft.example` — the environment variables Editkraft needs.

`init` is idempotent: it writes `created` for new files, `identical` for files whose
content already matches, and `skipped` for files that exist with different content
(use `--force` to overwrite). Re-running `init` reuses the existing migration
timestamp instead of creating a second migration file.

```
$ npx editkraft init
created  supabase/migrations/…_editkraft_init.sql
created  supabase/migrations/…_editkraft_i18n.sql
created  blocks/registry.ts
created  app/editkraft/preview/…
Editkraft is set up.
```

## `doctor`

Verifies that a project is correctly wired up: Next.js App Router detection,
`editkraft.config.ts` present, `blocks/registry.ts` uses `createRegistry()`, the
Editkraft migration exists, and the required ENV variables are set. Exits with
code `1` if any check fails.

## License

MIT
