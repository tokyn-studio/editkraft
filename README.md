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
npx editkraft init      # migration, editkraft.config.ts, blocks/registry.ts, preview & revalidate route
npx editkraft doctor    # checks migration state, ENV, and registry consistency
```

`init` is idempotent (overwrites nothing without `--force`) and creates an
SQL migration with published-only RLS. The RLS guarantee ("anon only reads
published content") is tested as a SQL fixture: `packages/cli/test/rls.fixture.sql`.

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
