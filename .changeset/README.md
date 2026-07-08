# Changesets

Jede PR mit einer Paketänderung braucht eine Changeset-Datei:

```bash
pnpm changeset
```

Wähle die betroffenen Pakete und den Bump-Typ. **SemVer strikt:** Änderungen, die
einen existierenden Blocktree ungültig machen oder das Verhalten der
Feld-Primitives ändern, sind immer `major` (siehe `docs/DECISIONS.md`).

Beim Merge auf `main` erzeugt die Release-Action einen Version-PR; dessen Merge
baut und published die Pakete nach npm.
