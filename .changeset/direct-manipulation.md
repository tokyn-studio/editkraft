---
"@editkraft/schema": minor
"@editkraft/react": minor
---

Direct Manipulation im Preview: neue `ek:focus-field`-Nachricht, `ek:update` als
bidirektionales Protokoll dokumentiert, dependency-freier `sanitizeRichText` +
`RICH_TEXT_ALLOWLIST` (RichText-Speicherformat = sanitisiertes HTML-Subset).
Renderer/Preview-Bridge macht `data-ek-field`-Elemente inline editierbar
(contentEditable, Mini-Toolbar für RichText, Bild-Klick → `ek:focus-field`).
