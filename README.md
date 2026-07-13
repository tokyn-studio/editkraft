# Editkraft

Open-source building blocks for **Editkraft**, a visual CMS for Next.js sites on
Vercel with Supabase. This repo contains everything that lives **in the customer
project** — the read path (customer Supabase → renderer → website) has no
dependency on Editkraft infrastructure. Content belongs to the customer.

## Packages

| Package | npm | Purpose |
| --- | --- | --- |
| `packages/schema` | `@editkraft/schema` | Block tree format, field primitives, Zod schemas — the contract |
| `packages/react` | `@editkraft/react` | Renderer (`EditkraftPage`, `createRegistry`, `renderBlocks`), revalidate handler, preview bridge (`@editkraft/react/preview`) |
| `packages/cli` | `editkraft` | `npx editkraft init` / `doctor` |

## Set up a customer project

```bash
npx editkraft init      # migration, config, block registry, render/preview/revalidate routes
npx editkraft doctor    # checks migration state, ENV, and registry consistency
```

Then:

1. `supabase db push` — apply the generated `ek_*` migration to YOUR Supabase project
2. Install the runtime: `npm i @editkraft/react @editkraft/schema @supabase/supabase-js zod`
3. Set the ENV from `.env.editkraft.example`
4. Connect the site in the [Editkraft Studio](https://studio.editkraft.com): Supabase URL +
   service key, then copy the three ENV lines the Studio shows you back into your project
5. Publish a page in the Studio — the scaffolded catch-all route serves it immediately

Two things bite every real-world project — the scaffold comments explain both:

- **Inline editing contract:** every editable element in a block needs
  `data-ek-field="<propName>"`. The Studio edits exclusively inline in the preview;
  blocks without the attribute render but cannot be edited.
- **i18n projects** (e.g. next-intl): move `app/[...slug]` under your locale segment and
  exclude `editkraft` from your middleware matcher; if your components need React context
  (translations, themes), provide it in `app/editkraft/preview/preview-client.tsx`.

`init` is idempotent (overwrites nothing without `--force`) and creates an
SQL migration with published-only RLS. The RLS guarantee ("anon only reads
published content") is tested as a SQL fixture: `packages/cli/test/rls.fixture.sql`.

## Migrating an existing site

Editkraft is built for existing sites: your pages become block compositions
that wrap your own components — pixel-identical, in every language — and are
seeded into your Supabase **before** you connect the Studio, so everything is
editable the moment the site is added there.

This step is executed by your coding agent (Claude Code, Cursor, …) against
a battle-tested playbook: **[`docs/MIGRATE.md`](docs/MIGRATE.md)**. Point your
agent at it right after `init`:

> Follow docs/MIGRATE.md from the editkraft repo to migrate this site.

## Development

```bash
pnpm install
pnpm build      # tsup: ESM + CJS + d.ts
pnpm test       # Vitest
pnpm typecheck
```

Contract details: [`docs/CONTRACT.md`](docs/CONTRACT.md) ·
Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## License

MIT
