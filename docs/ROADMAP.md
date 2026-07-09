# Editkraft Feature-Roadmap — Arbeitsanweisung für Claude Code

> Ablageort: `docs/ROADMAP.md` in **beiden** Repos (`tokyn-studio/editkraft`, `tokyn-studio/editkraft-studio`).
> Zweck: verbindliche Feature-Entscheidungen. Bei Widerspruch zu älteren Prompt-Formulierungen gilt dieses Dokument.
> Regeln für dich als Agent: Baue nichts aus "Nicht bauen". Baue nichts aus V2/V3+ vor, außer es ist explizit als "in v1 vorbereiten" markiert. Wenn eine Aufgabe hier fehlt oder widersprüchlich ist: nachfragen, nicht interpretieren.

---

## 1. MVP — jetzt bauen

### 1.1 Editor-Kern (Repo: editkraft-studio)
Klick-Selektion im Preview-iframe, Feld-Editing in der Sidebar (Formulare aus Registry-Schemas generiert), Draft/Publish, Versionshistorie mit Rollback. Wie in den Initialprompts spezifiziert.

### 1.2 Inline-Textediting im Preview
- **Repo editkraft (`@editkraft/react`):** Im Preview-Modus `contenteditable` auf Elemente legen, die an `ekText`/`ekRichText`-Felder gebunden sind. Änderungen debounced als `ek:update` an das Studio melden. KEINE strukturellen Edits inline (kein Einfügen/Löschen von Blöcken).
- **Repo editkraft-studio:** eingehende `ek:update`-Events in die Draft-Version schreiben; Sidebar-Feld und Inline-Ansicht bleiben synchron.
- DoD: Text im Preview tippen → Sidebar-Feld aktualisiert sich → Speichern erzeugt neue `ek_page_versions`-Version.

### 1.3 Medienbibliothek
- **Repo editkraft (CLI-Migration):** `ek_assets` wie spezifiziert; Storage-Bucket `ek-assets` mit RLS (public read, service write).
- **Repo editkraft-studio:** Bibliotheks-UI (Upload mit Client-Resize auf max. 2560px, Suche, Alt-Text-Pflege, Löschen mit Verwendungsprüfung), Verwendungsnachweis je Asset ("genutzt auf N Seiten" via Blocktree-Scan), Asset-Picker als Eingabekomponente für `ekImage`-Felder.
- Vorbereitung AI-Stufe 3: Upload-Pfad als wiederverwendbare Server-Funktion kapseln (`storeAsset()`), damit generierte Bilder später denselben Weg nehmen.
- DoD: Bild hochladen → in `ekImage`-Feld auswählen → published Seite rendert es aus dem Kunden-Storage.

### 1.4 Mehrsprachigkeit — Datenmodell + Basis-UI ⚠️ CONTRACT
- **Repo editkraft (`@editkraft/schema`, MUSS in v1 vor dem ersten Release):**
  - `ek_pages`: Spalten `locale` (text, BCP-47, default aus `editkraft.config.ts`) und `translation_group_id` (uuid; Seiten derselben Gruppe sind Übersetzungen voneinander), unique(`slug`,`locale`).
  - `editkraft.config.ts`: `locales: string[]`, `defaultLocale: string`.
  - Renderer: `<EditkraftPage locale=... />` mit Fallback auf `defaultLocale`, wenn keine published Version in der Ziel-Locale existiert; hreflang-/Sitemap-Helper exportieren.
- **Repo editkraft-studio:** Sprachumschalter je Seite; Aktion "Übersetzung anlegen" kopiert den Blocktree der Quellsprache in eine neue Seite derselben `translation_group_id`.
- **AI-Hook (Pflicht-Design, noch ohne AI):** "Übersetzung anlegen" ruft intern `createTranslation(pageId, targetLocale, translator?)` auf. `translator` ist optional und im MVP nicht gesetzt (= 1:1-Kopie). Das AI-Paket (Stufe 1) liefert später einen Gemini-Translator (Structured Output, Blockstruktur bleibt identisch, nur Text-Primitives werden übersetzt). Signatur und Test-Fixture dafür jetzt anlegen.
- DoD: Seite auf Deutsch publishen → englische Übersetzung anlegen und publishen → Renderer liefert je Locale die richtige Version, fehlende Locale fällt auf Default zurück.

### 1.5 Rollen & Audit (Repo: editkraft-studio)
Owner/Admin/Editor + Audit-Log: bereits in der Control Plane umgesetzt — nicht neu bauen, nur im Editor respektieren (Editor-Rolle darf editieren und publishen; Einschränkung kommt erst mit 2.5).

## 2. V2 — nach MVP-Abnahme, nicht vorher beginnen

Reihenfolge innerhalb V2 = Nummerierung.

### 2.1 Drag-and-drop Blockreihenfolge (editkraft-studio)
Zuerst im Struktur-/Layers-Panel der Sidebar (Liste mit Drag-Handles, schreibt Reihenfolge in den Blocktree), Canvas-Drag&Drop danach als eigener Schritt. **Qualitätsmesslatte ist Puck** (puckeditor.com): flüssiges Dragging mit visueller Drop-Vorschau (der Nutzer sieht VOR dem Loslassen, wie sich das Layout umsortiert), kein Springen, saubere Touch-Unterstützung. Wenn diese Messlatte im Zeitrahmen nicht erreichbar ist: Feature verschieben statt eine ruckelige Version shippen — ein schlechtes Drag&Drop schadet mehr als keines.

### 2.2 Block-Bibliothek: einfügen & löschen (editkraft-studio + Protokoll)
Panel speist sich aus der Registry des Kundenprojekts (`ek:tree`-Antwort um Registry-Metadaten erweitern: `type`, `label`, Slots). Einfügen an Selektionsposition, Löschen mit Undo via Versionshistorie.

### 2.3 Responsive Vorschau (editkraft-studio)
Viewport-Umschalter Desktop/Tablet/Mobil über iframe-Breite (1280/768/375). Keine breakpoint-spezifischen Props — nur Vorschau.

### 2.4 Symbols — wiederverwendbare Blöcke ⚠️ CONTRACT-VORBEREITUNG IN V1
- **Jetzt schon in `@editkraft/schema` v1:** Knotentyp `{ type: '$symbol', symbolId: string }` als reservierten Referenz-Knoten definieren + Zod-Schema; Renderer wirft dafür in v1 den definierten "nicht unterstützt"-Fehler. Tabelle `ek_symbols` (id, name, `content` jsonb) in den CLI-Migrationen anlegen, aber ungenutzt lassen.
- **In V2:** Renderer löst `$symbol` gegen `ek_symbols` auf (mit Zyklen-Schutz), Studio-UI für "als Symbol speichern" / Symbol einfügen / zentral bearbeiten.
- Grund der Vorbereitung: verhindert ein Major-Release des Schemas in V2.

### 2.5 Freigabe-Workflow (editkraft-studio, Entitlement: Agency)
`ek_page_versions` bekommt `review_status` (draft/submitted/approved). Editor-Rolle: nur "zur Freigabe einreichen"; Admin/Owner: freigeben + publishen. Benachrichtigung per E-Mail. Feature hinter `getEntitlements()` (nur Agency-Tarif). Berechtigungen dabei bis auf Editor-Feature-Ebene granular anlegen (Vorbild: Pucks Permissions-API) — z.B. "Editor darf Inhalte ändern, aber keine Blöcke löschen" — als Rollen-Capability-Map, nicht als verstreute if-Abfragen.

### 2.6 Scheduling (editkraft + editkraft-studio)
`ek_pages.publish_at` (timestamptz, nullable). CLI-Migration richtet `pg_cron`-Job in der **Kunden**-Supabase ein: setzt fällige `published_version_id` und ruft den Revalidate-Webhook. KEIN zentraler Scheduler in unserer Infrastruktur (Datenhoheits-Architektur). Studio: Datums-Picker am Publish-Button, Anzeige "geplant für …".

## 3. V3+ — nicht beginnen, nicht vorbereiten

Vorlagen-Bibliothek (kuratierte Seiten-Templates je Registry). Erst planen, wenn echte Sites Muster liefern.

## 4. AI-Paket — separater Auftrag, kostenpflichtiges Add-on

Nicht Teil von MVP/V2-Aufträgen; eigener Meilenstein nach eigenem Prompt. Stufen: (1) Text-Assist, SEO-Meta, Alt-Texte, Blocktree-Übersetzung via Gemini → nutzt den Hook aus 1.4; (2) Seitengenerierung aus Brief (Structured Output gegen Registry-Schemas); (3) Bildgenerierung (Imagen) via `storeAsset()` aus 1.3; (4) Video-Packs (Veo). Einzige Aufgabe für dich vorab: die in 1.3 und 1.4 markierten Hooks sauber bauen.

## 5. Nicht bauen — auch nicht auf Anfrage in Teilaufgaben

- A/B-Tests & Personalisierung
- SSO / Enterprise-Login
- Environments (Staging/Produktion): Status "offen, nicht entschieden" — nicht bauen, nicht im Schema vorbereiten, nicht in UI oder Marketing erwähnen. Draft/Publish deckt den Bedarf.

## 6. Arbeitsregeln

- ⚠️ CONTRACT-markierte Punkte (1.4, 2.4) betreffen `@editkraft/schema` und MÜSSEN vor dem ersten npm-Release des Schema-Pakets umgesetzt sein — jede spätere Änderung daran wäre ein Major-Release.
- Jedes Feature endet mit seinen DoD-Kriterien + Tests; Meilenstein-Zusammenfassung, dann auf Freigabe warten.
- Entitlement-gated Features (2.5, AI-Paket) immer über `getEntitlements()` prüfen, nie über Plan-Strings.
- Bei allem, was hier nicht steht: nachfragen.
