---
"@editkraft/react": patch
---

Editor: Die Bearbeiten-Popovers (Link/Button, Bild, Select) und der Bild-Crop
schließen jetzt bei einem Klick daneben und bei Escape – vorher blieben sie bis
zum Cancel-Klick offen. Ein Klick INS Popover (Felder/Buttons) lässt es offen.
Außenklick übernimmt den eingegebenen Wert (wie das Verlassen einer
Tabellenzelle), Escape verwirft ihn; der modale Crop-Modus bricht bei Außenklick
ab, damit ein Streifklick keinen Rahmen festschreibt.
