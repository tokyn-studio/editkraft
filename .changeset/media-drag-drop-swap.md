---
"@editkraft/react": minor
---

Preview-Bridge: Bilder lassen sich per Drag & Drop aus der Studio-Medienbibliothek auf ein Bild-Feld ziehen, um es auszutauschen. Während des Ziehens (Studio sendet `ek:media-drag-start`/`ek:media-drag-end`) werden Bild-Felder als Drop-Ziele hervorgehoben; beim Ablegen meldet die Preview `ek:media-drop` mit `blockId`/`fieldKey` zurück, das Studio setzt das Asset ein. Additiv und rückwärtskompatibel – ältere Studios senden diese Nachrichten nicht.
