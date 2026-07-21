---
"@editkraft/schema": minor
"@editkraft/react": minor
---

Textausrichtung im Rich-Text-Editor: links / mittig / rechts. Der Sanitizer (`@editkraft/schema`) erlaubt jetzt `text-align` (nur die validierten Werte left/center/right/justify, nur auf Block-Tags p/h2/h3/li/blockquote; als frisch gebautes `style="text-align:…"`, nie roh durchgereicht). Die Format-Toolbar (`@editkraft/react`) bekommt drei Ausrichtungs-Buttons, die den aktuellen Stand spiegeln und `text-align` per CSS (styleWithCSS) setzen.
