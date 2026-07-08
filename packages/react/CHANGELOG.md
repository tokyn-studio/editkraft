# @editkraft/react

## 0.1.0

### Minor Changes

- Initial release des Renderers: `createRegistry` (Vollständigkeitsprüfung),
  `renderBlocks` (Props-Validierung, unbekannte Typen im Dev als Platzhalter, in
  Production übersprungen + `console.warn`, Slots/children), `EditkraftPage` und
  `loadPublishedPage` (lädt published Content aus der Kunden-Supabase, prüft die
  `schemaVersion` und wirft bei Inkompatibilität `EditkraftSchemaError`),
  `createRevalidateHandler` (Shared-Secret-geschützte, tag-basierte ISR-Revalidation).
