# Design: Collections & Blog (Roadmap 2.8)

**Datum:** 2026-07-14 · **Status:** vom User freigegeben (Conversation-Review).
**Entwicklungszweig:** `feat/collections` (isolierter Worktree; Globals-Arbeit
läuft parallel auf main — Merge-Reihenfolge: Globals zuerst).

## Entscheidungen (mit User abgestimmt)

1. **Item-Modell:** strukturierte Felder + genau ein `ekRichText`-Body —
   kein Blocktree pro Artikel (V2-Option „Hybrid" dokumentiert, nicht gebaut).
2. **Editing:** inline auf der ECHTEN Artikelseite (Kunden-Template in der
   Preview, `data-ek-field` wie bei Blöcken) — kein Formular-Editor.
3. **Erkennung:** Agent-Playbook (MIGRATE.md-Kapitel) + `editkraft scan`
   als read-only Report-Helfer. Kein `--apply`.

## Datenmodell (Kunden-Supabase, neue CLI-Migration `_editkraft_collections.sql`)

```sql
ek_collections (
  id uuid pk default gen_random_uuid(),
  slug text not null unique,        -- "blog"
  name text not null,               -- "Blog"
  item_schema jsonb not null,       -- serialisierte Feld-Deskriptoren
  created_at timestamptz default now()
)
ek_collection_items (
  id uuid pk default gen_random_uuid(),
  collection_id uuid not null references ek_collections on delete cascade,
  slug text not null,
  locale text not null default '<defaultLocale>',
  translation_group_id uuid not null default gen_random_uuid(),
  draft_data jsonb not null,        -- Feldwerte inkl. body (richText-HTML)
  published_data jsonb,             -- Snapshot beim Publish; null = nie publiziert
  published_at timestamptz,
  sort_order integer,
  created_at/updated_at timestamptz,
  unique (collection_id, slug, locale)
)
```

- Draft/Publish als **Snapshot** (`published_data`), KEIN Versions-Log in v1
  (bewusste Abweichung vom Seiten-Modell; Historie = V2-Ausbau).
- RLS: anon liest `ek_collections` (Schema ist nicht geheim) und aus
  `ek_collection_items` nur Zeilen mit `published_data is not null`
  (Policy exponiert nur die published-Sicht); Schreiben nur Service-Role.
- updated_at-Trigger wie bei `ek_pages`.

## Schema-Paket (`@editkraft/schema`)

- `defineCollection({ slug, name, schema })` — analog `defineBlock`:
  validiert, dass jedes Feld ein ek-Primitiv ist (`deriveFieldDescriptors`
  wiederverwenden), Ergebnis trägt serialisierbare `fields`.
  Konvention: GENAU ein `ekRichText`-Feld als Body ist erlaubt, mehrere
  richText-Felder sind ok (kein Zwang) — aber mindestens ein Feld gesamt.
- `validateItemData(definition, data)` — parse gegen das Zod-Objekt.
- **Synthetischer Item-Block fürs Protokoll:** Helper
  `itemToBlock(collectionSlug, itemId, data)` →
  `{ id: itemId, type: "$collection:" + collectionSlug, props: data }` und
  `isCollectionBlockType(type)`. Damit läuft die BESTEHENDE Bridge
  (ek:schema/tree/update/focus-field, contenteditable, Toolbar, Bild-Picker)
  unverändert — das Studio sieht eine „Seite mit einem Block".

## React-Paket (`@editkraft/react`)

- `getCollection(supabase, slug, { locale?, defaultLocale?, limit?, order? })`
  → published Items (`{ id, slug, locale, data, publishedAt, sortOrder }[]`),
  Sortierung default `sort_order nulls last, published_at desc`,
  Locale-Fallback wie `loadPublishedPage`.
- `getCollectionItem(supabase, collectionSlug, itemSlug, { locale?, defaultLocale? })`
  → ein published Item oder null.
- **Collection-Registry:** `createRegistry` bekommt zusätzlich Einträge
  `{ collection: CollectionDefinition, template: Component }`; das Template
  erhält `{ item: data }`-Props und markiert Felder mit `data-ek-field`.
- **Item-Preview:** die gescaffoldete Preview-Route bekommt einen Item-Modus
  (`/editkraft/preview/…?token&collection=blog&item=<slug>&locale=…`):
  lädt das DRAFT-Item (Service-Key), rendert das registrierte Template und
  speist die Bridge mit dem synthetischen Ein-Block-Baum + den
  Collection-Feld-Deskriptoren (`ek:schema`). Kein neues Protokoll.
- CLI-Template der Preview-Route entsprechend erweitert (idempotent; Bestands-
  installationen aktualisieren die Datei mit `--force` oder manuell).

## Studio (`editkraft-studio`, nach Open-Core-Release)

- Site-Bereich **„Collections"**: Liste aus `ek_collections`; je Collection
  Item-Liste (erstes Textfeld als Titel, Status-Badge published/draft,
  published_at, sort_order), Locale-Filter wie Seitenliste.
- **„Neuer Artikel"**: legt Draft-Item an (Slug aus Titel-Eingabe,
  kollisionssicher; `draft_data` = Defaults/leer) und öffnet den Editor im
  Item-Modus.
- **Editor im Item-Modus:** gleiche Shell; iframe = Item-Preview-URL;
  Save schreibt `draft_data` (statt `ek_page_versions`), Publish kopiert
  `draft_data` → `published_data` + `published_at` und revalidiert Detail-
  UND Listen-Slug (Collection-Basispfad wird beim Anlegen der Collection
  gespeichert? Nein: Revalidate ruft den bestehenden Webhook mit dem
  Item-Slug `<collection>/<slug>` + zusätzlich `<collection>` auf — der
  Kunden-Handler mappt Tag→Pfad wie bisher).
- i18n: „Übersetzung anlegen" wie bei Seiten (Kopie in Ziel-Locale,
  gleiche translation_group_id).

## CLI

- Migration Nr. „+3s/+4s-Slot nach Symbols/Globals" (Reihenfolge wird beim
  Merge fixiert — Globals und Symbols landen vor Collections).
- **`editkraft scan`** (read-only): erkennt (a) Ordner mit .md/.mdx +
  Frontmatter (gray-matter-frei: eigener Mini-Parser für `---`-Blöcke),
  (b) TS/JS-Module mit exportierten gleichförmigen Objekt-Arrays (≥3 Items,
  gleiche Keys). Report menschenlesbar + `--json`: Kandidaten, abgeleitetes
  Feld-Schema (Frontmatter-Typen → ek-Primitives), Item-Anzahl, Locales-
  Vermutung. KEIN Umbau.
- MIGRATE.md-Kapitel „Collections & Blog": Scan → defineCollection →
  Migration → Seed (Frontmatter→Felder, Markdown→sanitisiertes richText-HTML)
  → Template registrieren + `data-ek-field` → Routen auf `getCollection()`
  umbauen → verifizieren (Baseline-Diff der Blog-Seiten).

## Tests / DoD

- schema: defineCollection-Validierung, itemToBlock-Roundtrip.
- react: getCollection/Item (gemockter Supabase-Client, Locale-Fallback,
  published-only), Item-Preview rendert Template + sendet ek:schema mit
  Collection-Feldern.
- cli: scan-Fixtures (mdx-Ordner, Array-Modul, Negativfall), Migrations-
  Snapshot.
- studio: Item-CRUD-Actions (Mock-Stil publish-actions), Publish-Snapshot +
  Revalidate-Aufrufe.
- **DoD (Roadmap):** Next.js-Projekt mit hartkodierter Blog-Liste → Scan
  erkennt die Struktur → Agent legt Collection + Items an → Redakteur legt
  im Studio einen neuen Beitrag an und published ihn → Site rendert ihn.

## Abgrenzung v1

Kein Versions-Log je Item, keine Taxonomien/Kategorien, kein Scheduling
(kommt mit 2.6), keine Item-übergreifende Suche, kein Hybrid-Body.
