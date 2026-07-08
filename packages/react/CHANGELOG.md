# @editkraft/react

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
