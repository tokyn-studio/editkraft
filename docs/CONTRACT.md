# Editkraft Contract (`@editkraft/schema`)

Die verbindliche Schnittstelle zwischen Renderer (`@editkraft/react`), CLI
(`editkraft`) **und dem Studio** (Nachbar-Repo `editkraft-studio`). Nur diese
Datei und `DECISIONS.md` sind für das Studio-Team maßgeblich.

`@editkraft/schema` ist Zod-first, dependency-arm (nur Zod) und ohne
React-/Next-Bezug. Typen werden per `z.infer` abgeleitet.

## Blocktree-Format

Inhalt von `ek_page_versions.content` (JSONB):

```ts
type Block = {
  id: string;          // nanoid, stabil über Edits hinweg
  type: string;        // Key in der Block-Registry des Kundenprojekts
  props: Record<string, unknown>;  // gegen das Zod-Schema des Blocks validiert
  children?: Block[];  // nur bei Blöcken mit Slots
};

type PageContent = {
  schemaVersion: string;  // SemVer des @editkraft/schema, das den Tree schrieb
  blocks: Block[];
};
```

Zod-Schemas: `blockSchema`, `pageContentSchema`. Helper: `emptyPageContent()`.

## Feld-Primitives

Zod-Schemas mit angehängten Metadaten, aus denen das Studio Eingabemasken
generiert. Der Renderer nutzt die Zod-Seite zur Validierung; das Studio liest die
Metadaten über `getFieldMeta(schema)`. Metadaten überleben `.optional()`,
`.nullable()` und `.default()`, **nicht** `.describe()` – Labels kommen aus der
Primitive-Konfiguration.

| Primitive | Wert-Typ | Metadaten (`kind` + Config) |
| --- | --- | --- |
| `ekText({ label?, multiline? })` | `string` | `text` |
| `ekRichText({ label? })` | `string` (sanitisiertes HTML, siehe `sanitizeRichText`) | `richText` |
| `ekImage({ label? })` | `EkImageValue` (`assetId`, `alt?`, `url?`, `width?`, `height?`) | `image` |
| `ekLink({ label? })` | `EkLinkValue` (`href`, `label?`, `external?`) | `link` |
| `ekColor({ label? })` | `string` (Hex `#rrggbb` oder Token) | `color` |
| `ekList(item, { label? })` | `item[]` | `list` (+ `item`-Metadaten) |
| `ekReference({ to, label? })` | `EkReferenceValue` (`id`) | `reference` (+ `to`) |

`getFieldMeta`, `isEkField` sowie die Wert-Schemas `ekImageValue`,
`ekLinkValue`, `ekReferenceValue` sind exportiert.

**Rich-Text-Format:** `ekRichText` speichert ein sanitisiertes HTML-Subset. Die
Allowlist (`RICH_TEXT_ALLOWLIST`: `strong`, `em`, `a[href]`) und die reine Funktion
`sanitizeRichText(html)` sind exportiert; Renderer (Ausgabe) und Inline-Editor
(Eingabe) nutzen denselben Sanitizer. `data-ek-field="<key>"` am DOM-Element bindet
es an sein Feld und macht es im Studio direkt editierbar.

## Block-Definition

```ts
const hero = defineBlock({
  type: 'Hero',
  label: 'Hero-Bereich',                 // Anzeige im Studio
  slots: [],                             // benannte children-Slots, z. B. ['columns']
  schema: z.object({
    headline: ekText({ label: 'Überschrift' }),
    image: ekImage(),
    cta: ekLink().optional(),
  }),
});
```

`defineBlock` validiert, dass **jedes** Feld ein Editkraft-Primitive ist, und
leitet `fields: BlockFieldDescriptor[]` ab (serialisierbar, für das Studio):
`{ key, kind, label?, optional, … }`. `validateBlockProps(def, props)` prüft
props gegen das Zod-Schema.

## DB-Rows (Kunden-Supabase, Prefix `ek_`)

Zod-Schemas: `ekPageRowSchema`, `ekPageVersionRowSchema`, `ekAssetRowSchema`.
Enum `pageStatusSchema` (`draft` | `published`), `pageMetaSchema` (offen, für
SEO). Asset-Bucket: `EK_ASSETS_BUCKET = "ek-assets"`. Die konkreten Tabellen legt
das CLI in Meilenstein 2 an.

## Versionierung

- `SCHEMA_VERSION` – MUSS mit `package.json.version` übereinstimmen.
- `satisfies(version, range)` / `isCompatible(writtenVersion, supportedRange)` –
  SemVer-Range-Prüfung (unterstützt `^`, `~`, Wildcards, Komparatoren, `||`).
- `majorOf(version)`.
- `migrateContent(content, to?)` + `registerMigration(...)` – Migrations-Gerüst.
  Gleiche Major → nur neu gestempelt; Major-Sprung ohne registrierte Migration
  wirft mit Handlungsanweisung.

**Breaking-Change-Regel:** Alles, was einen existierenden Blocktree ungültig
macht oder das Verhalten der Primitives ändert, ist ein **Major-Release**. Das
Studio deklariert `supportedSchemaVersions` als Range und prüft eingehende
`schemaVersion` mit `isCompatible`.

## postMessage-Protokoll (Preview ⇄ Studio)

Jede Nachricht trägt `channel: "editkraft"` und `v: PROTOCOL_VERSION`.

| Type | Richtung | Payload |
| --- | --- | --- |
| `ek:ready` | Preview → Studio | `schemaVersion` |
| `ek:select` | beide | `blockId` |
| `ek:update` | beide | `blockId`, `props` (Studio setzt / Preview meldet Inline-Edit) |
| `ek:focus-field` | Preview → Studio | `blockId`, `fieldKey` (Feld fokussiert / Bild-Klick) |
| `ek:tree` | Preview → Studio | `content: PageContent` |

- `createMessage(type, payload)` baut eine gültige Nachricht.
- `parseMessage(data)` validiert und gibt die typisierte Nachricht **oder `null`**
  zurück (fremde/ungültige Messages werfen nie).
- `isAllowedOrigin(origin, allowed)` – Pflicht-Origin-Check beim Empfänger; die
  erlaubte Studio-Origin kommt aus der ENV des Kundenprojekts. Das Protokoll
  allein authentifiziert nicht.

## Lokale Entwicklung gegen das Studio (`link:`-Workflow)

Zum gemeinsamen Iterieren am Contract kann das Studio-Repo `@editkraft/schema`
lokal verlinken:

```jsonc
// editkraft.studio: apps/studio/package.json (NUR lokal!)
"@editkraft/schema": "link:../../editkraft.public/packages/schema"
```

> Die lokalen Repos liegen als `editkraft.public/` und `editkraft.studio/`
> nebeneinander.

**Warnung:** `link:` darf **nie** auf `main` des Studio-Repos landen – dort steht
immer eine gepinnte npm-Version. Vor dem Commit im Studio auf die reguläre
Dependency zurückstellen.
