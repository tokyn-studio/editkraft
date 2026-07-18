---
"@editkraft/schema": minor
---

Medienfeld: Der Wert eines `ekImage`-Feldes kann jetzt ein Video statt eines
Bildes tragen. Neue optionale Wert-Felder `kind` ("image"|"video"), `poster`
(Vorschaubild-URL) und `controls` (Video-Steuerelemente). Abwärtskompatibel:
bestehende Bild-Werte ohne `kind` bleiben Bilder, der Registry-Feldtyp bleibt
`image`. Neuer exportierter Typ `EkMediaValue` für den Renderer.
