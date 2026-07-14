# Editkraft Feature-Roadmap — Arbeitsanweisung für Claude Code

> Ablageort: `docs/ROADMAP.md` in **beiden** Repos (`tokyn-studio/editkraft`, `tokyn-studio/editkraft-studio`).
> Zweck: verbindliche Feature-Entscheidungen. Bei Widerspruch zu älteren Prompt-Formulierungen gilt dieses Dokument.
> Regeln für dich als Agent: Baue nichts aus "Nicht bauen". Baue nichts aus V2/V3+ vor, außer es ist explizit als "in v1 vorbereiten" markiert. Wenn eine Aufgabe hier fehlt oder widersprüchlich ist: nachfragen, nicht interpretieren.

---

## 1. MVP — jetzt bauen

### 1.1 Editor-Kern (Repo: editkraft-studio)
Klick-Selektion im Preview-iframe, Feld-Editing in der Sidebar (Formulare aus Registry-Schemas generiert), Draft/Publish, Versionshistorie mit Rollback. Wie in den Initialprompts spezifiziert.

### 1.2 Inline-Textediting im Preview — ✅ umgesetzt (2026-07-09)
- **Repo editkraft (`@editkraft/react`):** Im Preview-Modus `contenteditable` auf Elemente legen, die an `ekText`/`ekRichText`-Felder gebunden sind. Änderungen debounced als `ek:update` an das Studio melden. KEINE strukturellen Edits inline (kein Einfügen/Löschen von Blöcken).
- **Repo editkraft-studio:** eingehende `ek:update`-Events in die Draft-Version schreiben; Sidebar-Feld und Inline-Ansicht bleiben synchron.
- DoD: Text im Preview tippen → Sidebar-Feld aktualisiert sich → Speichern erzeugt neue `ek_page_versions`-Version.
- **Status:** Feld-Bindung über `data-ek-field`; Ein-Klick-zu-Tippen mit Echo-Guard (fokussiertes Feld bleibt uncontrolled); Rich-Text-Mini-Toolbar (Fett/Kursiv/Link). Rich-Text-Format als sanitisiertes HTML-Subset festgezurrt (`sanitizeRichText`/`RICH_TEXT_ALLOWLIST`, zentral im Renderer erzwungen). Neue Protokoll-Nachricht `ek:focus-field`, `ek:update` bidirektional. OSS in PR (`@editkraft/schema` 0.3.0 / `@editkraft/react` 0.4.0); Studio-Seite fertig, wartet auf npm-Release zum Pinnen. Specs/Pläne: `docs/superpowers/{specs,plans}/2026-07-09-direct-manipulation-*`.

### 1.3 Medienbibliothek
- **Repo editkraft (CLI-Migration):** `ek_assets` wie spezifiziert; Storage-Bucket `ek-assets` mit RLS (public read, service write).
- **Repo editkraft-studio:** Bibliotheks-UI (Upload mit Client-Resize auf max. 2560px, Suche, Alt-Text-Pflege, Löschen mit Verwendungsprüfung), Verwendungsnachweis je Asset ("genutzt auf N Seiten" via Blocktree-Scan), Asset-Picker als Eingabekomponente für `ekImage`-Felder.
- Vorbereitung AI-Stufe 3: Upload-Pfad als wiederverwendbare Server-Funktion kapseln (`storeAsset()`), damit generierte Bilder später denselben Weg nehmen.
- **Andockpunkt vorhanden:** Der Klick-Pfad für Bilder ist bereits gebaut (1.2-Scheibe) — Klick auf ein `ekImage`-Feld im Canvas meldet `ek:focus-field`, die Sidebar fokussiert das Bildfeld und zeigt „Bild ersetzen". Diese Scheibe ersetzt die aktuelle URL/assetId-Eingabe durch den echten Asset-Picker im selben Pfad.
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

### 2.7 Supabase OAuth-Connect im Site-Wizard (editkraft-studio) — User-Freigabe 2026-07-13
Statt Supabase-URL + Service-Key von Hand: Button „Mit Supabase verbinden" (Supabase-OAuth-App, „Build with Supabase"). Nach Autorisierung erledigt das Studio per Management-API: Projekt in der **Kunden**-Organisation anlegen (Datenhoheit bleibt beim Kunden — Abgrenzung zu Managed-Hosting, das bewusst NICHT gebaut wird), `ek_*`-Migrationen einspielen, Keys abrufen und wie bisher verschlüsselt speichern. Eliminiert im Onboarding: Dashboard-Besuch, Key-Kopieren UND den `supabase db push`-Schritt der CLI-Anleitung. Wizard muss das Supabase-Free-Limit (2 aktive Projekte pro Account) sauber anzeigen. Herkunft: echter Kundentest — die Key-Abfrage ist die abschreckendste Stelle des Flows. Voraussetzungen: OAuth-App-Registrierung bei Supabase, Token-Storage analog `site_connections`, Scope-Doku.

### 2.8 Collections & Blog-Editing (editkraft + editkraft-studio) — aufgenommen 2026-07-14, Herkunft: fastmode-Konkurrenzanalyse
- **Problem:** Wiederholende Inhalte (Blogeinträge, Team, Referenzen, Testimonials) haben bei uns kein Datenmodell — jede Seite ist ein eigener Blocktree. fastmode gewinnt Nutzer genau mit „Upload → Blog/Team werden automatisch als Collections erkannt", kann das aber nur für statisches HTML.
- **Repo editkraft:** Tabellen `ek_collections` (id, name, slug, Feld-Schema als jsonb auf Basis der `@editkraft/schema`-Feldtypen) und `ek_collection_items` (id, collection_id, slug, data jsonb, published_at, sort_order) in der **Kunden**-Supabase (Datenhoheit wie bei Seiten). Renderer-Helper `getCollection()` / `getCollectionItem()` (published-Filter, Sortierung), damit Next.js-/Astro-Routen Items direkt rendern.
- **Repo editkraft-studio:** Collection-Übersicht je Site, Item-Editor mit demselben Feld-Editing wie Seiten (Draft/Publish je Item); Blog ist der Default-Anwendungsfall.
- **Auto-Detection (der eigentliche Differenzierer):** CLI-/MCP-Kommando scannt das Kundenprojekt (MDX-/Content-Ordner, Astro Content Collections, hartkodierte gemappte Arrays) und schlägt Collections samt Feld-Schema, Migrations-Skript und Code-Umbau auf `getCollection()` vor. Anspruch: „5 Minuten bis zum editierbaren Blog in einem Next.js-Projekt" — fastmodes Zero-Config-Versprechen, aber für echten Framework-Code.
- Detail-Design vor Umsetzung als Spec in `docs/superpowers/specs/`.
- DoD: Next.js-Projekt mit hartkodierter Blog-Liste → Scan erkennt die Struktur und legt Collection + Items an → Redakteur legt im Studio einen neuen Beitrag an und published ihn → Site rendert ihn.

### 2.9 Formulare & Submissions (editkraft + editkraft-studio) — aufgenommen 2026-07-14, Herkunft: fastmode-Konkurrenzanalyse
- **Repo editkraft:** `<EkForm name="…">`-Wrapper in `@editkraft/react`; Submissions landen in `ek_form_submissions` in der **Kunden**-Supabase (RLS: anon insert mit Rate-Limit, read nur service). Honeypot-Feld standardmäßig.
- **Repo editkraft-studio:** Submissions-Inbox je Site (Filter nach Formular, CSV-Export), E-Mail-Benachrichtigung an konfigurierbare Empfänger, optional Webhook je Formular.
- **Abgrenzung fastmode:** dort gibt es Formular-Erkennung + Submissions-API, aber keine dokumentierten Benachrichtigungen, keinen Spam-Schutz und keine Webhooks — genau diese drei bauen wir mit.
- DoD: Kontaktformular absenden → Submission erscheint in der Inbox + Benachrichtigungs-Mail geht raus → Honeypot-Testeintrag erscheint nicht.

### 2.10 editkraft MCP-Server (Repo: editkraft, npm-Paket `@editkraft/mcp`) — aufgenommen 2026-07-14, Herkunft: fastmode-Konkurrenzanalyse
- Per `npx` startbar ohne Installation; Auth gegen das Studio (Device-Flow o.ä., Token-Storage analog `site_connections`).
- Tools: Projekt-/Site-Liste, Registry-/Schema-Introspektion, Seiten- und Collection-CRUD (immer als Draft), Instrumentierungs-Check („welche Komponenten sind noch nicht an ek-Felder gebunden?").
- Zweck: Cursor, Claude Code, Windsurf & Co. generieren direkt editkraft-instrumentierten Code — AI-Coding-Tools sind der Distributionskanal dieser Kategorie (fastmode dokumentiert seinen MCP-Server `fastmode-mcp` für acht Clients).
- Setup-Doku je Client (mind. Cursor, Claude Code, Windsurf).
- DoD: In Cursor per MCP eine Seite anlegen und ein Feld ändern → Änderung erscheint als Draft im Studio.

## 3. V3+ — nicht beginnen, nicht vorbereiten

- Vorlagen-Bibliothek (kuratierte Seiten-Templates je Registry). Erst planen, wenn echte Sites Muster liefern.
- Externe Content-REST-API (Collections/Items/Submissions lesen & schreiben, published-Filter, API-Keys je Site) für Headless-Nutzung — fastmode bietet das schon im Free-Tier, für uns erst sinnvoll, wenn 2.8/2.9 stehen.
- Page-Level-SEO-Controls + globale Head-Code-Injection im Studio (sofern nicht bereits über Registry-Felder des Kundenprojekts abgedeckt).
- White-label Client-Portal für Agenturen (eigenes Branding/eigene Domain für Kunden-Logins) — passt zum Agency-Entitlement aus 2.5; fastmode nutzt das als einziges echtes Pro-Argument ($20/Monat).

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
