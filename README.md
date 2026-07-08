# Editkraft

Open-Source-Bausteine für **Editkraft**, ein visuelles CMS für Next.js-Websites auf
Vercel mit Supabase. Dieses Repo enthält alles, was **im Kundenprojekt** lebt –
der Lese-Pfad (Kunden-Supabase → Renderer → Website) hat keine Abhängigkeit zur
Editkraft-Infrastruktur. Content gehört dem Kunden.

## Pakete

| Paket | npm | Zweck |
| --- | --- | --- |
| `packages/schema` | `@editkraft/schema` | Blocktree-Format, Feld-Primitives, Zod-Schemas – der Contract |
| `packages/react` | `@editkraft/react` | Renderer, Block-Registry, Preview-Bridge |
| `packages/cli` | `editkraft` | `npx editkraft init` / `doctor` |

## Kundenprojekt einrichten

```bash
npx editkraft init      # Migration, editkraft.config.ts, blocks/registry.ts, Preview- & Revalidate-Route
npx editkraft doctor    # prüft Migrationstand, ENV und Registry-Konsistenz
```

`init` ist idempotent (überschreibt nichts ohne `--force`) und legt eine
SQL-Migration mit published-only-RLS an. Die RLS-Garantie („anon liest nur
published") ist als SQL-Fixture getestet: `packages/cli/test/rls.fixture.sql`.

## Entwicklung

```bash
pnpm install
pnpm build      # tsup: ESM + CJS + d.ts
pnpm test       # Vitest
pnpm typecheck
```

Contract-Details: [`docs/CONTRACT.md`](docs/CONTRACT.md) ·
Entscheidungen: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Lizenz

MIT
