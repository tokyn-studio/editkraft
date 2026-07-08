---
name: editkraft
description: Use when making a React component in a Next.js + Supabase project editable in the Editkraft Studio – converting component props into Editkraft field primitives, writing defineBlock, registering the block, and handling schema migrations when a component is reworked.
---

# Editkraft: Komponenten CMS-fähig machen

Dieser Skill hilft, bestehende React-Komponenten in einem Next.js-Projekt für das
**Editkraft-Studio** editierbar zu machen. Editkraft rendert Content aus der
Kunden-Supabase über eine **Block-Registry**; das Studio generiert Eingabemasken
aus den **Feld-Primitives** eines Blocks.

## Grundprinzip

Eine Komponente wird zum Block, indem du:
1. ihre **inhaltlichen** Props auf Editkraft-Feld-Primitives abbildest,
2. mit `defineBlock` ein Block-Schema definierst (deutschsprachiges `label`),
3. Definition + Komponente in `blocks/registry.ts` registrierst.

```ts
import { defineBlock, ekText, ekImage, ekLink } from "@editkraft/schema";

const hero = defineBlock({
  type: "Hero",                     // stabiler Key, wird im Content gespeichert
  label: "Hero-Bereich",            // Anzeige im Studio (Deutsch, für Endkunden)
  schema: z.object({
    headline: ekText({ label: "Überschrift" }),
    image: ekImage({ label: "Bild" }),
    cta: ekLink({ label: "Button" }).optional(),
  }),
});
```

## Feld-Primitives (aus `@editkraft/schema`)

| Primitive | Für | Wert |
| --- | --- | --- |
| `ekText({ label, multiline })` | kurze/lange Texte | `string` |
| `ekRichText({ label })` | formatierter Text | HTML/Markdown-`string` |
| `ekImage({ label })` | Bilder | `{ assetId, alt?, url?, width?, height? }` |
| `ekLink({ label })` | Links/Buttons | `{ href, label?, external? }` |
| `ekColor({ label })` | Farben | Hex oder Token-`string` |
| `ekList(item, { label })` | Wiederholungen | `item[]` |
| `ekReference({ to, label })` | Verweise | `{ id }` |

**Labels immer auf Deutsch** und aus Endkundensicht ("Überschrift", nicht
"headline"). Optionale Felder mit `.optional()`.

## Was gehört NIE ins Schema

- **Logik / Verhalten** (Klick-Handler, Fetching, Bedingungen) – bleibt in der Komponente.
- **Styling-Details** (Klassen, Abstände, Farben, die nicht redaktionell sind) – Design gehört ins Theme, nicht ins CMS.
- **Technische IDs, Feature-Flags, Query-Parameter** – kein editierbarer Content.

Faustregel: Ins Schema kommt nur, was ein Redakteur bewusst ändern können soll.

## Registrieren

```ts
// blocks/registry.ts
import { createRegistry } from "@editkraft/react";
import { Hero } from "./Hero";

export const registry = createRegistry([
  { definition: hero, component: Hero },
]);
```

`createRegistry` prüft, dass jeder Typ Definition (mit Schema) UND Komponente hat.

## Schema-Migration bei Komponenten-Umbau

**Regel:** Ändert ein Umbau ein bestehendes Feld so, dass alte Blocktrees ungültig
würden (Feld umbenannt, Typ geändert, Pflicht statt optional), ist das ein
**Breaking Change** → neuer **Major-Release** von `@editkraft/schema` und eine
Migration mit `registerMigration`.

Rückwärtskompatible Ergänzungen (neues optionales Feld) sind ein **Minor** – kein
Migrationsbedarf, weil bestehende Trees gültig bleiben.

```ts
import { registerMigration } from "@editkraft/schema";

// Beispiel: Feld "subtitle" (string) → "subline" (RichText) in v2
registerMigration({
  from: "1.4.2",
  to: "2.0.0",
  migrate: (content) => ({
    ...content,
    blocks: content.blocks.map((b) =>
      b.type === "Hero" && "subtitle" in b.props
        ? { ...b, props: { ...b.props, subline: b.props.subtitle, subtitle: undefined } }
        : b,
    ),
  }),
});
```

---

## Beispiel 1 – Statische Hero-Komponente CMS-fähig machen

### Vorher (hartcodierter Content)

```tsx
export function Hero() {
  return (
    <section className="hero">
      <h1>Willkommen bei Müller Bau</h1>
      <p>Ihr Partner für Neubau und Sanierung seit 1987.</p>
      <a href="/kontakt" className="btn">Kontakt aufnehmen</a>
    </section>
  );
}
```

### Nachher (Block-Definition + Komponente)

```tsx
// blocks/Hero.tsx
import type { EkLinkValue } from "@editkraft/schema";

export function Hero({
  headline,
  subline,
  cta,
}: {
  headline: string;
  subline?: string;
  cta?: EkLinkValue;
}) {
  return (
    <section className="hero">
      <h1>{headline}</h1>
      {subline ? <p>{subline}</p> : null}
      {cta ? <a href={cta.href} className="btn">{cta.label ?? cta.href}</a> : null}
    </section>
  );
}
```

```ts
// blocks/registry.ts (Ausschnitt)
import { defineBlock, ekText, ekLink } from "@editkraft/schema";
import { z } from "zod";
import { Hero } from "./Hero";

const heroBlock = defineBlock({
  type: "Hero",
  label: "Hero-Bereich",
  schema: z.object({
    headline: ekText({ label: "Überschrift" }),
    subline: ekText({ label: "Unterzeile", multiline: true }).optional(),
    cta: ekLink({ label: "Button" }).optional(),
  }),
});
```

Beachte: Die CSS-Klasse `hero` und `btn` bleiben in der Komponente (Styling,
kein Content). Nur Text und Link werden editierbar.

---

## Beispiel 2 – Wiederholungen mit `ekList` und ein Bild

### Vorher

```tsx
export function Leistungen() {
  const items = [
    { titel: "Neubau", text: "Schlüsselfertige Häuser." },
    { titel: "Sanierung", text: "Altbau modernisieren." },
  ];
  return (
    <ul>
      {items.map((i) => (
        <li key={i.titel}><h3>{i.titel}</h3><p>{i.text}</p></li>
      ))}
    </ul>
  );
}
```

Das Array `items` ist redaktioneller Content und gehört ins Schema – als Liste
von Objekten. `ekList` nimmt ein Primitive pro Feld; für Objekt-Einträge
modellierst du die Felder als separate Listen oder – gängiger – als eigenen
**Kind-Block** über Slots. Für einfache Fälle nutzt du parallele Listen bzw.
einen dedizierten `LeistungsItem`-Block.

### Nachher (mit Kind-Blöcken über einen Slot)

```ts
// Container-Block mit Slot "items"
const leistungen = defineBlock({
  type: "Leistungen",
  label: "Leistungsliste",
  slots: ["items"],
  schema: z.object({
    ueberschrift: ekText({ label: "Überschrift" }).optional(),
  }),
});

// Kind-Block je Eintrag
const leistungsItem = defineBlock({
  type: "LeistungsItem",
  label: "Leistung",
  schema: z.object({
    titel: ekText({ label: "Titel" }),
    text: ekText({ label: "Beschreibung", multiline: true }),
    icon: ekImage({ label: "Icon" }).optional(),
  }),
});
```

```tsx
// blocks/Leistungen.tsx – der Container rendert seine children (Slot "items")
export function Leistungen({
  ueberschrift,
  children,
}: {
  ueberschrift?: string;
  children?: React.ReactNode;
}) {
  return (
    <section>
      {ueberschrift ? <h2>{ueberschrift}</h2> : null}
      <ul>{children}</ul>
    </section>
  );
}
```

So kann der Redakteur im Studio beliebig viele `LeistungsItem`-Blöcke in den
Slot legen. Für ein einzelnes optionales Bild pro Item nutzt du `ekImage` direkt
im Item-Schema (siehe oben).

---

## Checkliste

- [ ] Nur redaktionellen Content ins Schema, nie Logik/Styling.
- [ ] Deutsche `label`s aus Endkundensicht.
- [ ] Optionales mit `.optional()`.
- [ ] Wiederholungen als `ekList` oder Kind-Blöcke über Slots.
- [ ] Block in `blocks/registry.ts` registriert.
- [ ] Breaking-Change am Schema → Major + `registerMigration`.
- [ ] `npx editkraft doctor` läuft grün.
