# Design: Site-Globals (v1)

**Datum:** 2026-07-14 · **Status:** vom User freigegeben; implementiert
(Open-Core + Studio, Release + Referenz-Integration ausstehend) ·
**Herkunft:** Kundentest #2 (equisanny): `settings.ts`-Inhalte (Kontaktdaten,
Claim, Instagram) sind im Studio nicht editierbar; MIGRATE.md deklariert sie
bislang ausdrücklich als „stays code". Dieses Feature schließt die Lücke.

**Kernidee:** Site-weite Inhalte (Telefon, E-Mail, Claim, …) werden vom Kunden
**in Code definiert** (`defineGlobals`, bestehende Feld-Primitives), in der
**Kunden-Supabase gespeichert** (`ek_globals`, draft/published) und **inline im
Editor** über die bestehende postMessage-Bridge bearbeitet — kein separates
Formular, kein Seed-Kanal für Deskriptoren, kein neues Auth-Modell. Kontakt-
Sektion und Footer bleiben automatisch synchron, weil beide dieselbe Quelle
rendern.

Vier Teile, zwei Repos:

| Teil | Repo | Kern |
|---|---|---|
| 1. Contract | editkraft (schema) | `defineGlobals`, Messages `ek:globals` + `ek:global-update`, Row-Schema |
| 2. DB + CLI | editkraft (cli) | Migration `ek_globals` (Einzelzeile, draft/published, Spalten-GRANT) |
| 3. Renderer + Preview | editkraft (react) | Loader, Globals-Prop in `renderBlocks`, Inline-Editing via `data-ek-global` |
| 4. Studio | editkraft-studio | Reducer/Client, Save/Publish-Erweiterung, `globals-data.ts` |

Referenz-Integration: equisanny-copy (Kundenrepo) + MIGRATE.md-Abschnitt.

## Teil 1: Contract (`@editkraft/schema`)

**`defineGlobals`** (neue Datei `packages/schema/src/globals.ts`):

```ts
defineGlobals({ schema: z.ZodObject }): GlobalsDefinition
// GlobalsDefinition = { schema; fields: GlobalsFieldDescriptor[] }
// GlobalsFieldDescriptor = EkFieldMeta & { key: string; optional: boolean }
```

Identische Ableitung wie `defineBlock` (jedes Feld MUSS ein ek-Primitive sein,
sonst throw) — die Deskriptor-Derivation wird als geteilter Helper aus
`block.ts` extrahiert (DRY, kein Verhaltensunterschied).

**Protokoll** (`protocol.ts`), beide Messages additiv:

| type | Richtung | Payload |
|---|---|---|
| `ek:globals` | preview → studio | `fields: GlobalsFieldDescriptor[]`, `values: Record<string, unknown>` |
| `ek:global-update` | beide | `values: Record<string, unknown>` (Patch, analog `ek:update.props`) |

Kompatibilität: `parseMessage` alter Gegenstellen liefert für unbekannte Typen
`null` → ignoriert. `SCHEMA_VERSION` bleibt `0.1.0` (das Baum-FORMAT ändert
sich nicht; Globals sind ein eigener Datensatz). Paketversion: schema **0.6.0**.

**Row-Schema** (`rows.ts`): `ekGlobalsRowSchema` = `{ id: 1, draft:
Record<string,unknown> | null, published: Record<string,unknown> | null,
updated_at }`.

## Teil 2: DB-Migration + CLI (`editkraft` 0.4.0)

Neue Template-Funktion `globalsMigration()` in
`packages/cli/src/templates/migration.ts`, von `generate.ts` als dritte Datei
`<ts+2>_editkraft_globals.sql` emittiert (idempotent, `if not exists`-Muster):

```sql
create table if not exists public.ek_globals (
  id smallint primary key default 1 check (id = 1),  -- exakt eine Zeile
  draft jsonb,
  published jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists ek_globals_set_updated_at on public.ek_globals;
create trigger ek_globals_set_updated_at before update on public.ek_globals
  for each row execute function public.ek_set_updated_at();

alter table public.ek_globals enable row level security;

-- Draft darf NIE öffentlich lesbar sein (ADR-009-Prinzip). RLS filtert nur
-- Zeilen, keine Spalten → Spalten-GRANT: anon/authenticated sehen nur
-- id/published/updated_at. Supabase-Default-Privileges vorher zurücknehmen.
revoke all on public.ek_globals from anon, authenticated;
grant select (id, published, updated_at) on public.ek_globals to anon, authenticated;
grant all on public.ek_globals to service_role;

drop policy if exists "ek public reads published globals" on public.ek_globals;
create policy "ek public reads published globals"
  on public.ek_globals for select
  to anon, authenticated
  using (published is not null);

insert into public.ek_globals (id) values (1) on conflict (id) do nothing;
```

Bewusst KEINE Versionstabelle (`ek_globals_versions`): Globals sind wenige
Stammdaten, Historie ist YAGNI für v1 — neue ADR in `docs/DECISIONS.md`
(Einzelzeilen-Tabelle + Spalten-GRANT-Muster), Eintrag in `docs/CONTRACT.md`.

`editkraft init` auf Bestandsprojekten: bestehende Init-/i18n-Migrationen
werden wie bisher übersprungen, die Globals-Migration kommt additiv dazu
(gleiches `existingMigrationTimestamp`-Muster).

## Teil 3: Renderer + Preview (`@editkraft/react` 0.7.0)

**Loader** (`data.ts`):

```ts
loadGlobals<S>(supabase, definition: GlobalsDefinition<S>): Promise<z.infer<S> | null>
loadDraftGlobals<S>(supabase, definition): Promise<z.infer<S> | null>  // service_role
globalsTag(): string  // "editkraft:globals"
```

- `loadGlobals` selektiert NUR `published` (Spalten-GRANT-kompatibel),
  `safeParse` gegen `definition.schema` → bei Invalid/`null`/fehlender Tabelle
  (42P01/PGRST205) → `null`. Kunde fällt dann auf Code-Defaults zurück.
- `loadDraftGlobals` liest `draft ?? published` (Service-Client, Preview-Route).

**Rendering:** `renderBlocks(blocks, registry, options?: { globals? })` und
`<EditkraftPage globals={…}>` reichen `globals` als zusätzliche Prop an JEDE
Block-Komponente (Blöcke, die sie nicht deklarieren, ignorieren sie). Kein
Context — funktioniert identisch in RSC (Live-Site) und Client (Preview).

**Preview** (`preview.tsx`): neue optionale Prop
`globals?: { definition: GlobalsDefinition; values: Record<string, unknown> }`.

- Nach `ek:ready`/`ek:schema`/`ek:tree` sendet die Preview zusätzlich
  `ek:globals` (fields + values). Ohne Prop: kein Message, Verhalten wie heute.
- Elemente mit **`data-ek-global="<key>"`** werden analog `data-ek-field`
  contenteditable, wenn das Feld-Kind `text` oder `richText` ist (v1; select/
  image für Globals später). Gleiche Mechanik: Debounce 300 ms →
  `ek:global-update { values: { key } }`, Fokus-Echo-Guard, Sanitizing bei
  richText. (Implementierungs-Abweichung v1: richText-Globals bekommen KEINE
  Format-Toolbar — die Toolbar-Mechanik hängt an blockId/fieldKey; Globals
  editieren sich ohne Toolbar, Formatierung über native Shortcuts. Folgt bei
  Bedarf.)
- Globals-Werte fließen als `globals`-Prop in die gerenderten Blöcke → eine
  Änderung an EINER Stelle (z. B. Telefon in der Kontakt-Sektion) aktualisiert
  live alle Vorkommen im Canvas.
- Eingehendes `ek:global-update` (Studio → Preview) wird mit Echo-Guard auf das
  fokussierte Global angewendet (identisch zum `ek:update`-Muster).

**Revalidate** (`revalidate.ts`): Payload-Erweiterung — `{ globals: true }`
zusätzlich zur bisherigen Record-Form → Handler ruft
`revalidateTag(globalsTag())`. Bestehende Aufrufe unverändert.

## Teil 4: Studio (`editkraft-studio`)

**Editor-State** (`editor-reducer.ts`, rein/getestet): State um
`globals: { fields; values } | null` erweitert; `applyIncoming` behandelt
`ek:globals` (setzt fields+values) und `ek:global-update` (merged values).

**Editor-Client** (`editor-client.tsx`): `ek:global-update` aus der Preview →
`dirty` + State-Merge. Save- und Publish-Form bekommen ein hidden field
`globalsValues` (JSON), NUR wenn die Bridge Globals gemeldet hat — Sites ohne
Globals verhalten sich exakt wie heute.

**Lib** (`apps/studio/src/lib/globals-data.ts`, server-only, Muster
`editor-data.ts`/`editor-save.ts`):

```ts
saveGlobalsDraft(siteId, values: Record<string, unknown>): Promise<void>
publishGlobals(siteId, values): Promise<void>  // schreibt draft UND published
```

- Upsert auf `ek_globals` (id=1). Fehlende Tabelle (42P01/PGRST205) → Fehler
  mit klarem Text („Site-Migration ausführen") — tritt nur auf, wenn die
  Preview Globals meldet, die DB aber alt ist.
- Kein Zod-Parse im Studio (das Schema lebt im Kundenrepo); Studio validiert
  nur „ist ein JSON-Objekt". Die Live-Site parst beim Lesen (Teil 3) — invalide
  Werte können die Site nie kaputt machen, nur auf Defaults zurückfallen.

**Actions:** `saveDraft` speichert Globals-Draft mit (wenn Feld vorhanden);
`publishDraft` ruft zusätzlich `publishGlobals` und sendet dem Kunden-Endpoint
`{ globals: true }` neben den Slug-Revalidates. Audit-Actions:
`site.globals.saved` / `site.globals.published`. Studio-`@editkraft/schema`
auf 0.6.0 anheben (neue Messages parsen).

**UI:** bewusst unsichtbar — Globals hängen am bestehenden Save/Publish-Fluss
(impliziter Save wie beim Content). Keine neuen i18n-Keys nötig außer
Fehlertext für die fehlende Migration (de/en).

## Referenz-Integration (equisanny copy) + Doku

1. `npx editkraft init` (bringt neue Migration) → `supabase db push`;
   Pakete auf schema 0.6.0 / react 0.7.0 heben.
2. `src/blocks/globals.ts`: `defineGlobals` mit `phone`, `email`, `region`,
   `instagramHandle`, `instagramUrl`, `claim`, `owner` (alles `ekText`).
3. `settings.ts` bleibt als **Fallback/Default** bestehen; neuer Helper
   `src/lib/globals.ts`: `getGlobals()` = React `cache()` um
   `loadGlobals(...) ?? settings`.
4. Konsumenten: Kontakt-Sektion bekommt `globals`-Prop (+ `data-ek-global`
   auf Telefon/E-Mail/Region/Instagram), `(site)/layout.tsx` lädt Globals für
   Header/Footer, Preview-Route lädt `loadDraftGlobals` und reicht
   `globals={{ definition, values }}` an `EditkraftPreview`.
5. Initiales Publish der Code-Werte über den Editor (einmal Publish drücken)
   — kein Seed-Skript nötig.
6. `docs/MIGRATE.md`: „stays code"-Absatz ersetzen durch Globals-Playbook;
   react-README-Abschnitt; `docs/ROADMAP.md` beider Repos ergänzen.

## Grenzen v1 (bewusst)

- **Nicht lokalisiert** — eine Globals-Zeile pro Site (V2: `locale`-Spalte
  analog `ek_pages`, dann Gruppen-Publish-Semantik).
- **Keine Historie** (kein `ek_globals_versions`).
- Inline editierbar nur `text`/`richText`; `select`/`image`-Globals später.
- SEO-Metadata (description) bleibt Code.
- Header/Footer sind in der Preview weiterhin `pointer-events-none` (Chrome) —
  Globals werden dort live MITaktualisiert, editiert wird in den Blöcken.

## Tests

- **schema:** `defineGlobals` (Nicht-ek-Feld → throw, Deskriptor-Ableitung,
  optional-Flag), Message-Roundtrips beider neuer Typen, `parseMessage`-
  Rückwärtskompatibilität (unbekannter Typ → null), `ekGlobalsRowSchema`.
- **cli:** Snapshot der neuen Migrationsdatei; Re-Run-Idempotenz (Datei
  existiert → skipped).
- **react:** Loader (published-only-Select, 42P01/PGRST205 → null, safeParse-
  Fallback), `renderBlocks`-Prop-Injektion, Preview-Handshake sendet
  `ek:globals`, `data-ek-global` wird editierbar, Update-Fluss + Echo-Guard
  (bestehendes preview.test-Setup).
- **studio:** Reducer (`ek:globals`/`ek:global-update`), `globals-data` mit
  `makeBuilder`-Muster (inkl. 42P01-Pfad), `saveDraft`/`publishDraft` mit
  gemockter Lib (Globals vorhanden/abwesend), bestehende Tests bleiben grün.

## Release & Rollout

1. Open-Core-Changeset: schema **minor 0.6.0**, react **minor 0.7.0**
   (peer-Range anheben), cli **minor 0.4.0**. Version-PR manuell, Merge durch
   den User, CI published.
2. Studio: schema-Dependency 0.6.0, Teil 4 implementieren, Deploy via git push.
3. equisanny copy als Referenz-Integration verifizieren (Editor: Telefonnummer
   inline ändern → Publish → live), dann MIGRATE.md-Playbook finalisieren.
