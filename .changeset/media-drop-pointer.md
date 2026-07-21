---
"@editkraft/react": minor
---

Preview-Bridge: Bild-Drag&Drop-Austausch auf koordinatenbasiertes Hit-Testing umgestellt. Native HTML5-Drop-Events überqueren die cross-origin-iframe-Grenze nicht zuverlässig (Chrome liefert `drop` im fremd-origin iframe gar nicht), weshalb der Austausch bisher nicht funktionierte. Das Studio managt den Drag jetzt per Pointer-Capture und schickt Cursor-Koordinaten (`ek:media-drag-move` / `ek:media-drop-at`); die Preview trifft das Bild-Feld per `elementFromPoint`, hebt es hervor und meldet den Drop via `ek:media-drop` zurück. Rückwärtskompatibel (reine Roh-Nachrichten).
