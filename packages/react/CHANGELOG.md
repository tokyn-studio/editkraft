# @editkraft/react

## 0.4.0

### Minor Changes

- d86168c: Direct Manipulation im Preview: neue `ek:focus-field`-Nachricht, `ek:update` als
  bidirektionales Protokoll dokumentiert, dependency-freier `sanitizeRichText` +
  `RICH_TEXT_ALLOWLIST` (RichText-Speicherformat = sanitisiertes HTML-Subset).
  Renderer/Preview-Bridge macht `data-ek-field`-Elemente inline editierbar
  (contentEditable, Mini-Toolbar für RichText, Bild-Klick → `ek:focus-field`).
  Der Renderer (`renderBlocks`/`EditkraftPage`) sanitisiert `richText`-Props jetzt
  zentral vor der Übergabe an die Block-Komponente – secure-by-default, unabhängig
  davon, ob der Block-Autor selbst `sanitizeRichText` aufruft.

### Patch Changes

- Updated dependencies [d86168c]
  - @editkraft/schema@0.3.0

## 0.3.0

### Minor Changes

- Editor-Fundament: neue postMessage-Nachricht `ek:schema` (Preview liefert die
  Block-Feld-Deskriptoren ans Studio), `Registry.descriptors()`, `EditkraftPreview`
  sendet das Schema beim Mount. Neues signiertes Draft-Token (`createDraftToken`/
  `verifyDraftToken`, HMAC via Web Crypto) für cookie-freie Preview; `editkraft init`
  generiert die Preview-Route jetzt token-gegated (ENV `EDITKRAFT_PREVIEW_SECRET`).

### Patch Changes

- Updated dependencies
  - @editkraft/schema@0.2.0

## 0.2.1

### Patch Changes

- Preview-Fixes aus dem End-to-End-Test:
  - `createRevalidateHandler` importiert `next/cache` jetzt lazy zur Laufzeit, damit
    der statische Modulgraph von `@editkraft/react` in Client-nahen Bäumen sauber
    bleibt (sonst „revalidateTag only works in a Server Component").
  - `editkraft init` generiert die Preview jetzt als Server-Route + separaten
    Client-Wrapper (`preview-client.tsx`); die Registry wird client-seitig
    importiert und nicht mehr über die Server→Client-Grenze gereicht.

## 0.2.0

### Minor Changes

- Preview-Bridge: `EditkraftPreview` (Client-Komponente, Import über
  `@editkraft/react/preview`) rendert Draft-Content mit Klick-Overlays und spricht
  das postMessage-Protokoll mit dem Studio (`ek:ready`/`ek:tree` senden,
  `ek:update`/`ek:select` empfangen, Origin-Check). Neu: `loadDraftContent`
  (Draft-Loader für den Draft Mode) sowie die Tree-Utilities `updateBlockProps`
  und `findBlock`.

## 0.1.0

### Minor Changes

- Initial release des Renderers: `createRegistry` (Vollständigkeitsprüfung),
  `renderBlocks` (Props-Validierung, unbekannte Typen im Dev als Platzhalter, in
  Production übersprungen + `console.warn`, Slots/children), `EditkraftPage` und
  `loadPublishedPage` (lädt published Content aus der Kunden-Supabase, prüft die
  `schemaVersion` und wirft bei Inkompatibilität `EditkraftSchemaError`),
  `createRevalidateHandler` (Shared-Secret-geschützte, tag-basierte ISR-Revalidation).
