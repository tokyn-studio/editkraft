# editkraft

The Editkraft CLI: `init`, `doctor`, and `scan` for Next.js projects with Supabase.

## Usage

```bash
npx editkraft init      # sets up Editkraft in the current project
npx editkraft doctor    # checks migration state, ENV, and registry consistency
npx editkraft scan      # read-only scan for collection candidates (--json for machines)
```

```
editkraft – visual CMS for Next.js + Supabase

Usage:
  npx editkraft <command> [options]

Commands:
  init      Sets up Editkraft in the current project (migration, config, registry, routes)
  doctor    Checks migration state, ENV, and registry consistency
  scan      Read-only scan for collection candidates (frontmatter dirs, object arrays)

Options:
  --yes, -y     Non-interactive (accepts defaults)
  --force       Overwrite existing files
  --json        Machine-readable output (scan)
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
- `supabase/migrations/<timestamp+2s>_editkraft_collections.sql` — collections
  (`ek_collections`, `ek_collection_items`) with published-only RLS
  (`published_data is not null`); additive, safe on existing installations
- `editkraft.config.ts` — registry path and allowed Studio origin.
- `blocks/registry.ts` + `blocks/Hero.tsx` — an example block registry and component.
  The Hero shows the **inline-editing contract**: every editable element carries
  `data-ek-field="<propName>"` — without it a block renders but cannot be edited
  in the Studio.
- `app/[...slug]/page.tsx` — the public render route serving PUBLISHED pages
  (catch-all; your static routes win). i18n projects move it under their locale
  segment — the template's header comment explains how.
- `app/api/editkraft/revalidate/route.ts` — the ISR revalidate webhook handler.
- `app/editkraft/preview/[[...slug]]/page.tsx` + `preview-client.tsx` — the draft
  preview route used by the Studio. If your blocks need React context (next-intl,
  themes), wrap the preview client with those providers.
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

## `scan`

Read-only detector for collection candidates — content that lives in the repo
but behaves like a CMS collection (blog posts, team members, testimonials).
It finds:

- **Frontmatter directories**: folders with 3+ `.md`/`.mdx` files that start
  with a `---` frontmatter block.
- **Object arrays**: exported array literals in `.ts`/`.js` modules with 3+
  elements sharing the identical key set.

For each candidate it suggests an ek field schema (`ekText`, `ekRichText`,
`ekImage`, `ekLink`; dates stay `ekText` until a date primitive exists) plus a
locale guess. `--json` prints `{ "candidates": [...] }` for agents. `scan`
never modifies the project — the follow-up steps live in the
"Collections & blog" chapter of `docs/MIGRATE.md`.

Detection is heuristic (regex + brace matching, no AST): arrays built via
`.map()`, spreads, shorthand properties, or re-exports are not detected, and
nested frontmatter values are flattened to text.

## `doctor`

Verifies that a project is correctly wired up: Next.js App Router detection,
`editkraft.config.ts` present, `blocks/registry.ts` uses `createRegistry()`, the
Editkraft migration exists, and the required ENV variables are set. Exits with
code `1` if any check fails.

## License

MIT
