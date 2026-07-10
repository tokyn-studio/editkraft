---
"@editkraft/schema": minor
"@editkraft/react": minor
---

Rich-Text-Formatierung, Link-Bearbeitung und Bild-Werkzeuge in der Live-Vorschau:

- Schema: Rich-Text-Allowlist um p/h2/h3/u/s erweitert; `ekImageValue.frame`
  (non-destruktives 1:1-Framing) + `imageFrameStyles()` als gemeinsame
  Render-Helfer für Vorschau und veröffentlichte Seite
- React: schwebende Formatierungs-Toolbar (B/I/U/S, Absatz/H2/H3, Links),
  Link-Popover (URL/Mail/Tel, Button- und Inline-Links), Bild-Popover
  (URL/Upload/Drag&Drop, Alt-Text), 1:1-Zuschneiden mit Pan+Zoom sowie
  Öffnen des Studio-KI-Bild-Editors (ek:ai-edit-open)
