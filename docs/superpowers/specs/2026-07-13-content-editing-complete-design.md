# Design: Paket „Content-Editing komplett"

**Datum:** 2026-07-13 · **Status:** vom User freigegeben (Conversation-Review) ·
**Herkunft:** kundenvalidiertes Backlog aus zwei echten End-to-End-Onboardings.

Drei Teile, zwei Repos:

| Teil | Repo(s) | Kern |
|---|---|---|
| 1. RichText-Erweiterung | editkraft (schema + react) | Listen/br/hr/code/blockquote + a[target] |
| 2. `ekSelect`-Primitiv | editkraft (schema + react) | Enum-Feld mit Options-Popover im Inline-Editing |
| 3. Setup-Verify & Bridge-Diagnose | editkraft-studio | Editor-Banner + „Preview testen"-Button |

Architektur-Entscheidung: Sämtliche neue Editier-UI lebt im
`@editkraft/react`-Preview-Paket (wo Toolbar/Link-/Bild-Popover schon wohnen).
Das Studio ändert sich nur für Teil 3.

## Teil 1: RichText

**Allowlist** (`packages/schema/src/rich-text.ts`) erweitert um:
`ul: []`, `ol: []`, `li: []`, `br: []`, `hr: []`, `code: []`,
`blockquote: []`; `a` wird `["href", "target"]`.

**Sanitizer-Regeln:**
- `br`/`hr` sind Void-Tags: werden als `<br>`/`<hr>` neu aufgebaut, schließende
  Varianten verworfen, kein Schließtag-Tracking.
- `a`: `href` wie bisher (SAFE_HREF-Protokollprüfung). `target` überlebt NUR
  als `target="_blank"`; in dem Fall wird `rel="noopener noreferrer"`
  ERZWUNGEN (ein vom Input geliefertes `rel` wird ignoriert — Attribute
  werden weiterhin neu aufgebaut, nie durchgereicht).
- Idempotenz bleibt Pflicht (Testfall: doppeltes Sanitizen = identisch).

**Toolbar** (`packages/react/src/preview.tsx`): neue Buttons „UL", „OL"
(`document.execCommand("insertUnorderedList"/"insertOrderedList")`) und
„Zitat" (`formatBlock <blockquote>`); Aktiv-Status wie bei den bestehenden
Buttons. KEINE Buttons für `code`/`hr` (v1: Inhalte bleiben erhalten und
editierbar; `br` entsteht nativ per Shift+Enter).

**Contract (Korrektur während der Implementierung):** `SCHEMA_VERSION`
bleibt `0.1.0` — das Baum-FORMAT ändert sich nicht (richText ist ein String,
Select-Werte sind Strings). Ein Bump würde jeden ausgelieferten Renderer hart
brechen (Default-Range hängt an `majorOf(SCHEMA_VERSION)`), obwohl alte
Renderer neue Tags ohnehin nur sanft strippen. Es steigen ausschließlich die
npm-Paketversionen (schema 0.5.0, react 0.6.0).

## Teil 2: `ekSelect`

**Schema** (`packages/schema/src/fields.ts` bzw. wo die Primitives leben):

```ts
ekSelect({ label?: string, options: { value: string; label?: string }[] })
```

- Validierung: strikte Enum (z.enum über die values); min. 1 Option.
- Feld-Metadaten: `{ kind: "select", label?, options }` — `EkFieldKind` um
  `"select"` erweitert, `getFieldMeta`/`isEkField` decken es ab.
- `BlockFieldDescriptor` transportiert die Options (serialisierbar — die
  Deskriptoren gehen per `ek:schema` an das Studio).

**Preview-UI:** Klick auf ein Element mit `data-ek-field`, dessen Feld-Kind
`select` ist → Popover (gleiche Machart/Positionierung wie das Link-Popover)
mit der Options-Liste (Labels, aktueller Wert markiert). Auswahl → bestehender
`ek:update`-Fluss (debounced entfällt — Select schreibt sofort). Kein
contenteditable auf Select-Feldern.

**Rendering** bleibt Sache des Blocks (z. B. Icon-Key → Icon-Komponente mit
Fallback für unbekannte Werte). Doku: react-README-Abschnitt + Beispiel.

## Teil 3: Setup-Verify & Bridge-Diagnose (Studio)

**(a) Editor-Banner:** Beim Laden des Preview-iframes startet eine 5s-Frist.
Kommt bis dahin kein `ek:ready` (neuer `ready`-Flag im Editor-State, gesetzt
in `applyIncoming`), erscheint ein Banner über dem Canvas:
„Die Vorschau meldet sich nicht" + die drei realen Ursachen in Klartext
(1. Editkraft-Routen nicht deployt, 2. `EDITKRAFT_PREVIEW_SECRET` stimmt
nicht mit dem Wert auf der Site-Seite überein, 3. `NEXT_PUBLIC_EDITKRAFT_
STUDIO_ORIGIN` zeigt nicht auf dieses Studio) + Button „Erneut prüfen"
(iframe reload, Frist neu) + Link zur Site-Seite (ENV-Zeilen). `ek:ready`
blendet das Banner sofort aus. Fristlogik als reine, getestete Funktion.

**(b) „Preview testen"-Button** (Site-Detailseite, neben den ENV-Zeilen,
nur Owner/Admin): Server-Action
1. lädt Seitenliste (`listPages`); ohne Seiten → Ergebnis „Verbunden, aber
   noch keine Seiten — Migration/Seed ausführen" (kein Fehler),
2. erzeugt Draft-Token (`ensurePreviewSecret` + `createDraftToken`),
3. ruft `GET {preview_url}/editkraft/preview/{slug}?token=…&locale=…`
   serverseitig ab (Timeout ~8s, kein Follow auf fremde Origins),
4. übersetzt: 200 → „Preview verbunden ✓"; 404 → „Route erreichbar, aber
   Token abgelehnt — Secret deployt? Deployment aktuell?" bzw. wenn auch
   `{preview_url}/` nicht 200 liefert → „Site nicht erreichbar — URL prüfen";
   Netzwerkfehler/Timeout → „Site nicht erreichbar".
   (404 kann Route-fehlt UND Secret-falsch bedeuten — der Text benennt beide.)
Rate-Limit wie der bestehende Verbindungstest. i18n de/en.

## Tests

- schema: Sanitizer (jeder neue Tag, rel-Erzwingung, target≠_blank fällt weg,
  Void-Tags, Idempotenz), ekSelect (Validierung, Meta, Deskriptor-Roundtrip).
- react: Toolbar-Buttons vorhanden/kommandieren korrekt (bestehendes
  Test-Setup), Select-Popover öffnet/patcht (preview.test).
- studio: Banner-Fristlogik (reine Funktion), Server-Action mit gemocktem
  fetch (alle vier Ergebnisklassen), bestehende 226 Tests bleiben grün.

## Release & Rollout

1. Open-Core: Changeset `@editkraft/schema` minor (0.5.0 — Version im Code
   UND package.json), `@editkraft/react` minor (0.6.0, peer/`supportedSchema
   Range`), `editkraft` (CLI) patch (Doku/Dep-Hinweise). Version-PR manuell,
   Merge durch den User, CI published.
2. Studio: eigene `@editkraft/schema`-Dependency anheben (parseMessage/
   Deskriptoren), Teil 3 implementieren, Deploy via git push.
3. Doku: react-README (ekSelect, neue Tags), MIGRATE.md-Absatz zu Legal-
   Texten aktualisieren (lokaler Sanitizer wird für Neu-Migrationen obsolet).
