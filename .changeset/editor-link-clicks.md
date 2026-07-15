---
"@editkraft/react": minor
---

Editor: Ein Klick auf einen Button/Link im Canvas navigiert nicht mehr, sondern
öffnet die Bearbeitung für Label + URL. Das gilt auch, wenn das ekLink-Feld auf
einem Wrapper um den `<a>` sitzt (statt auf dem `<a>` selbst) oder wenn auf ein
Icon/`<span>` innerhalb des Links geklickt wird. Ein `<a>` in einem richText-Feld
öffnet weiterhin das Inline-Link-Popover; Links ohne editierbares Feld schlucken
nur die Navigation und selektieren den Block.
