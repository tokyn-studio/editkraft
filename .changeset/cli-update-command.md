---
"editkraft": minor
---

New `editkraft update` command: bumps `@editkraft/react` and `@editkraft/schema` in your project to the latest published version and installs. Shows old → new per package, flags potentially breaking bumps (0.x minor / major) with a link to the changelog, detects your package manager (npm/pnpm/yarn/bun), and points you to `editkraft doctor` + `supabase db push` afterwards. `--dry-run` previews without writing; `--yes` skips the prompt.
