# Direct Manipulation – OSS (Contract + Renderer) Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inline-Editing im Preview-iframe: `data-ek-field`-Elemente werden im Editor `contentEditable`, Text-Änderungen fließen als `ek:update` zurück ans Studio, `ekRichText` bekommt eine Mini-Toolbar (Fett/Kursiv/Link) mit sanitisiertem HTML-Speicherformat, und Klick auf ein Bild meldet `ek:focus-field`.

**Architecture:** Der Contract (`@editkraft/schema`) bekommt eine neue Nachricht `ek:focus-field`, dokumentiert `ek:update` als bidirektional und liefert einen dependency-freien `sanitizeRichText`-Sanitizer plus `RICH_TEXT_ALLOWLIST`. Die Preview-Bridge (`@editkraft/react`) findet nach dem Render die `[data-ek-field]`-Elemente je Block-Wrapper, macht Text/RichText editierbar, verdrahtet Eingabe→`ek:update` (debounced) und Fokus→`ek:focus-field`, blendet bei RichText-Auswahl eine Mini-Toolbar ein und legt über Bild-Feldern einen „Bild ersetzen"-Overlay-Button. Der kritische Punkt ist der **Echo-Guard**: das aktuell fokussierte Feld ist „uncontrolled" – eingehendes `ek:update` darf es nicht überschreiben.

**Tech Stack:** TypeScript strict (ESM, tsup), Zod (einzige schema-Dependency), React ≥18 (Peer), Vitest + Testing Library (jsdom), Changesets.

## Global Constraints

- **`@editkraft/schema` bleibt dependency-arm (nur Zod).** `sanitizeRichText` wird von Hand implementiert, **keine neue Dependency**, **node-tauglich** (kein `DOMParser`/`document`), damit der serverseitige Renderer ihn nutzen kann.
- **Breaking-Change-Regel:** Neue Nachrichten-Typen und additive Exports sind **minor**. Der Blocktree bleibt gültig (`ekRichText` bleibt ein `string`) – **kein Major**, `SCHEMA_VERSION` wird nicht angefasst.
- **`PROTOCOL_VERSION` bleibt `1`** – neue Message ist rückwärtskompatibel (alte Parser ignorieren unbekannte `type` über die `discriminatedUnion`).
- **Origin-Check bleibt Pflicht** in beide Richtungen (`isAllowedOrigin`); das Protokoll authentifiziert nicht.
- **Sanitizer ist sicherheitskritisch:** rebuild-from-scratch (nie rohe Attribut-Strings durchreichen), `href` gegen Protokoll-Allowlist prüfen, Text HTML-escapen, `<script>`/`<style>` inkl. Inhalt entfernen, **idempotent** (`sanitize(sanitize(x)) === sanitize(x)`).
- TS strict, `exactOptionalPropertyTypes`. Conventional Commits; kein Commit mit rotem Test/TS-Fehler. Changesets-Pflicht bei Paketänderung.
- Alle Pfade relativ zu `editkraft.public/`. Arbeitsbranch: `feat/editor-direct-manipulation` (bereits angelegt).
- Test-Kommando: `pnpm --filter @editkraft/schema test` bzw. `pnpm --filter @editkraft/react test` (Vitest). Vom Repo-Root.

---

### Task 1: Contract – `ek:focus-field`-Nachricht + bidirektionales `ek:update`

**Files:**
- Modify: `packages/schema/src/protocol.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/src/protocol.test.ts`

**Interfaces:**
- Produces:
  - `ekFocusFieldMessage` (Zod) + `type EkFocusFieldMessage = { channel: "editkraft"; v: 1; type: "ek:focus-field"; blockId: string; fieldKey: string }`.
  - `ek:focus-field` als Member der `ekMessage`-`discriminatedUnion` (parse/create funktionieren dafür).
  - `ek:update` dokumentiert als „beide Richtungen" (kein Signatur-Diff).

- [ ] **Step 1: Failing test** — an `packages/schema/src/protocol.test.ts` anhängen:

```ts
import { ekFocusFieldMessage } from "./protocol";

describe("ek:focus-field", () => {
  it("createMessage baut eine gültige focus-field-Nachricht", () => {
    const msg = createMessage("ek:focus-field", { blockId: "b1", fieldKey: "headline" });
    expect(msg).toEqual({
      channel: "editkraft",
      v: 1,
      type: "ek:focus-field",
      blockId: "b1",
      fieldKey: "headline",
    });
  });

  it("parseMessage akzeptiert focus-field und liefert die Felder typisiert", () => {
    const parsed = parseMessage(createMessage("ek:focus-field", { blockId: "b2", fieldKey: "body" }));
    expect(parsed?.type).toBe("ek:focus-field");
    expect(parsed && parsed.type === "ek:focus-field" ? parsed.fieldKey : null).toBe("body");
  });

  it("das direkte Schema lehnt eine focus-field-Nachricht ohne fieldKey ab", () => {
    expect(ekFocusFieldMessage.safeParse({ channel: "editkraft", v: 1, type: "ek:focus-field", blockId: "b1" }).success).toBe(false);
  });
});
```

> Prüfe, ob `createMessage`/`parseMessage` oben in der Datei bereits importiert sind; falls nicht, ergänze sie im bestehenden Import aus `./protocol`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @editkraft/schema test -- protocol`
Expected: FAIL (`ekFocusFieldMessage` ist kein Export / `ek:focus-field` unbekannt in `createMessage`).

- [ ] **Step 3: Implement** — in `packages/schema/src/protocol.ts`:

Den Richtungs-Kommentar am Dateikopf (Block ab „Richtung:") ersetzen durch:

```ts
 * Richtung:
 *   preview → studio: ek:ready, ek:schema, ek:tree, ek:select, ek:focus-field
 *                     ek:update (Inline-Edit im Preview)
 *   studio → preview: ek:select (Selektion setzen), ek:update (Prop-Update)
 *
 * ek:select und ek:update sind bidirektional (beide Seiten senden/empfangen).
```

Den Doc-Kommentar über `ekUpdateMessage` ersetzen durch:

```ts
/** Prop-Update für einen Block. Bidirektional: Studio setzt props (Live-Vorschau),
 *  die Preview meldet Inline-Edits mit derselben Payload zurück. */
```

Nach `ekSchemaMessage` (vor `ekMessage`) einfügen:

```ts
/** Preview → Studio: Nutzer ist in ein Feld gegangen (Inline-Klick / Bild-Klick). */
export const ekFocusFieldMessage = z.object({
  ...base,
  type: z.literal("ek:focus-field"),
  blockId: z.string(),
  fieldKey: z.string(),
});
export type EkFocusFieldMessage = z.infer<typeof ekFocusFieldMessage>;
```

`ekMessage` um den neuen Member erweitern:

```ts
export const ekMessage = z.discriminatedUnion("type", [
  ekReadyMessage,
  ekSelectMessage,
  ekUpdateMessage,
  ekTreeMessage,
  ekSchemaMessage,
  ekFocusFieldMessage,
]);
```

- [ ] **Step 4: Export** — in `packages/schema/src/index.ts` im `./protocol`-Export-Block ergänzen: bei den Werten `ekFocusFieldMessage,` (nach `ekSchemaMessage,`) und bei den Typen `type EkFocusFieldMessage,` (nach `type EkSchemaMessage,`).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @editkraft/schema test -- protocol`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/protocol.ts packages/schema/src/index.ts packages/schema/src/protocol.test.ts
git commit -m "feat(schema): add ek:focus-field message, document ek:update as bidirectional"
```

---

### Task 2: Contract – `sanitizeRichText` + `RICH_TEXT_ALLOWLIST`

**Files:**
- Create: `packages/schema/src/rich-text.ts`
- Create: `packages/schema/src/rich-text.test.ts`
- Modify: `packages/schema/src/index.ts`
- Modify: `packages/schema/src/primitives.ts` (Doc-Kommentar an `ekRichText`)

**Interfaces:**
- Produces:
  - `RICH_TEXT_ALLOWLIST: { readonly strong: []; readonly em: []; readonly a: ["href"] }`
  - `sanitizeRichText(input: string): string` – reine Funktion, node-tauglich, idempotent.

- [ ] **Step 1: Failing test** — `packages/schema/src/rich-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sanitizeRichText, RICH_TEXT_ALLOWLIST } from "./rich-text";

describe("sanitizeRichText", () => {
  it("behält erlaubte Inline-Tags", () => {
    expect(sanitizeRichText("<strong>a</strong> und <em>b</em>")).toBe("<strong>a</strong> und <em>b</em>");
  });

  it("normalisiert <b>/<i> zu <strong>/<em>", () => {
    expect(sanitizeRichText("<b>x</b><i>y</i>")).toBe("<strong>x</strong><em>y</em>");
  });

  it("entfernt <script> samt Inhalt", () => {
    expect(sanitizeRichText('a<script>alert(1)</script>b')).toBe("ab");
  });

  it("entfernt unbekannte Tags, behält deren Text", () => {
    expect(sanitizeRichText('<div class="x">text</div>')).toBe("text");
  });

  it("behält sichere hrefs, verwirft javascript:-URLs (Text bleibt)", () => {
    expect(sanitizeRichText('<a href="https://x.de">link</a>')).toBe('<a href="https://x.de">link</a>');
    expect(sanitizeRichText('<a href="javascript:alert(1)">böse</a>')).toBe("böse");
  });

  it("droppt alle Attribute außer href auf <a>", () => {
    expect(sanitizeRichText('<a href="/x" onclick="evil()">t</a>')).toBe('<a href="/x">t</a>');
  });

  it("escapt rohe Winkelklammern in Text", () => {
    expect(sanitizeRichText("1 < 2 & 3 > 0")).toBe("1 &lt; 2 &amp; 3 &gt; 0");
  });

  it("schließt offene Tags am Ende", () => {
    expect(sanitizeRichText("<strong>x")).toBe("<strong>x</strong>");
  });

  it("ist idempotent", () => {
    const dirty = '<div><b>x</b> & <a href="javascript:1">y</a> < z</div>';
    const once = sanitizeRichText(dirty);
    expect(sanitizeRichText(once)).toBe(once);
  });

  it("Allowlist ist stabil", () => {
    expect(Object.keys(RICH_TEXT_ALLOWLIST).sort()).toEqual(["a", "em", "strong"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @editkraft/schema test -- rich-text`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implement** — `packages/schema/src/rich-text.ts`:

```ts
/**
 * Kanonischer Rich-Text-Sanitizer (Teil des Contracts). Von Renderer (Ausgabe)
 * UND Inline-Editor (Eingabe-Normalisierung) genutzt, damit beide konsistent
 * bleiben. Dependency-frei und node-tauglich (kein DOMParser).
 *
 * Sicherheitsmodell: Tags werden NICHT durchgereicht, sondern aus einer festen
 * Allowlist neu aufgebaut; nur <a href> mit sicherem Protokoll überlebt, alle
 * anderen Attribute fallen weg. Text wird HTML-escaped. <script>/<style> werden
 * inkl. Inhalt entfernt. Ausgabe ist idempotent.
 */

export const RICH_TEXT_ALLOWLIST = {
  strong: [],
  em: [],
  a: ["href"],
} as const;

const TAG_ALIASES: Record<string, string> = { b: "strong", i: "em" };
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/)/i;

/** Escapt Text-Knoten. Entity-bewusst bei `&`, damit die Funktion idempotent bleibt. */
function escapeText(s: string): string {
  return s
    .replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#\d+;|#x[0-9a-fA-F]+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#\d+;|#x[0-9a-fA-F]+;)/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractHref(attrs: string): string | null {
  const m = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? "";
}

export function sanitizeRichText(input: string): string {
  if (!input) return "";
  // 1. script/style inkl. Inhalt entfernen.
  const cleaned = input.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");

  // 2. Tokenisieren und Allowlist-Tags neu aufbauen.
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  const open: string[] = [];
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(cleaned)) !== null) {
    out += escapeText(cleaned.slice(last, m.index));
    last = tagRe.lastIndex;

    const isClose = m[0][1] === "/";
    const name = TAG_ALIASES[m[1].toLowerCase()] ?? m[1].toLowerCase();
    if (!(name in RICH_TEXT_ALLOWLIST)) continue; // unbekanntes Tag: droppen, Text bleibt

    if (isClose) {
      const idx = open.lastIndexOf(name);
      if (idx !== -1) {
        out += `</${name}>`;
        open.splice(idx, 1);
      }
      continue;
    }

    if (name === "a") {
      const href = extractHref(m[2]);
      if (href && SAFE_HREF.test(href)) {
        out += `<a href="${escapeAttr(href)}">`;
        open.push("a");
      }
      // ungültiger/fehlender href: Link-Wrapper droppen, Text bleibt
      continue;
    }

    out += `<${name}>`;
    open.push(name);
  }

  out += escapeText(cleaned.slice(last));
  for (let k = open.length - 1; k >= 0; k--) out += `</${open[k]}>`;
  return out;
}
```

- [ ] **Step 4: Export + Doc** — in `packages/schema/src/index.ts` neuen Export-Block anfügen (nach dem `./protocol`-Block):

```ts
export { RICH_TEXT_ALLOWLIST, sanitizeRichText } from "./rich-text";
```

In `packages/schema/src/primitives.ts` den Doc-Kommentar an `ekRichText` (aktuell „…die konkrete Serialisierung ist Renderer-Sache.") ersetzen durch:

```ts
/** Rich-Text als sanitisiertes HTML-Subset (siehe RICH_TEXT_ALLOWLIST / sanitizeRichText). */
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @editkraft/schema test -- rich-text`
Expected: PASS (alle 10 Fälle inkl. Idempotenz).

- [ ] **Step 6: Full schema test + build sanity**

Run: `pnpm --filter @editkraft/schema test && pnpm --filter @editkraft/schema build`
Expected: PASS, Build ohne Fehler.

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/rich-text.ts packages/schema/src/rich-text.test.ts packages/schema/src/index.ts packages/schema/src/primitives.ts
git commit -m "feat(schema): add dependency-free sanitizeRichText + RICH_TEXT_ALLOWLIST"
```

---

### Task 3: Renderer – Inline-Feld-Binding (contentEditable + `ek:update` + Echo-Guard)

**Files:**
- Modify: `packages/react/src/preview.tsx`
- Test: `packages/react/src/preview.test.tsx`

**Interfaces:**
- Consumes: `sanitizeRichText`, `createMessage`, `parseMessage`, `isAllowedOrigin` aus `@editkraft/schema`; `Registry.get(type).definition.fields` (Feld-`kind`).
- Produces: Preview-Verhalten – `[data-ek-field]`-Elemente mit `kind` `text`/`richText` werden `contentEditable`; `input` → debounced `ek:update` (Preview→Studio); `focusin` → `ek:focus-field`; eingehendes `ek:update` überschreibt das **fokussierte** Feld nicht (Echo-Guard).

**Hintergrund für den Implementierer:** Der Kunden-Component rendert `<h1 data-ek-field="headline">{headline}</h1>`. Nach jedem Render scannt ein `useEffect` den Block-Container nach `[data-ek-field]`, ermittelt Block-Typ (nächster `[data-editkraft-block-id]`-Vorfahr → `tree`-Lookup → `registry`-Deskriptor) und Feld-`kind`. Für `text`/`richText` wird `contentEditable="true"` gesetzt. Eingaben werden **per Event-Delegation** am Container behandelt (nicht pro Element), damit Re-Renders keine Listener-Duplikate erzeugen. **Das fokussierte Feld ist uncontrolled:** Solange es fokussiert ist, aktualisiert die Preview seinen Prop-Wert im lokalen `tree`-State NICHT (sonst würde React den getippten Inhalt zurücksetzen). Erst bei `blur` wird der finale, bei RichText sanitisierte Wert in den lokalen State übernommen.

- [ ] **Step 1: Failing test** — an `packages/react/src/preview.test.tsx` anhängen. Zuerst die Test-Registry/-Blöcke oben um ein `data-ek-field`-Element erweitern: ersetze die `Hero`- und `Text`-Testkomponenten durch Varianten mit Attribut:

```tsx
function Hero({ headline }: { headline: string }) {
  return <h1 data-ek-field="headline">{headline}</h1>;
}
function Text({ body }: { body: string }) {
  return <p data-ek-field="body">{body}</p>;
}
```

und die Registry-Definition von `Text` auf `body` mit `ekText` belassen (bereits so). Dann neue Testfälle:

```ts
function fieldEl(container: HTMLElement, blockId: string, key: string): HTMLElement {
  return container.querySelector(
    `[data-editkraft-block-id="${blockId}"] [data-ek-field="${key}"]`,
  ) as HTMLElement;
}

describe("Inline-Editing", () => {
  it("macht text-Felder contentEditable", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    expect(fieldEl(container, "b1", "headline").getAttribute("contenteditable")).toBe("true");
  });

  it("Tippen im Feld sendet ek:update an das Studio", async () => {
    vi.useFakeTimers();
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    const el = fieldEl(container, "b1", "headline");
    post.mockClear();
    act(() => {
      el.focus();
      el.textContent = "Neu getippt";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      vi.advanceTimersByTime(400);
    });
    const upd = post.mock.calls.map((c) => c[0] as { type: string; blockId?: string; props?: Record<string, unknown> }).find((x) => x.type === "ek:update");
    expect(upd?.blockId).toBe("b1");
    expect(upd?.props?.headline).toBe("Neu getippt");
    post.mockRestore();
    vi.useRealTimers();
  });

  it("Fokus in ein Feld meldet ek:focus-field", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    post.mockClear();
    act(() => fieldEl(container, "b1", "headline").dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    const focus = post.mock.calls.map((c) => c[0] as { type: string; fieldKey?: string }).find((x) => x.type === "ek:focus-field");
    expect(focus?.fieldKey).toBe("headline");
    post.mockRestore();
  });

  it("Echo-Guard: eingehendes ek:update überschreibt das fokussierte Feld nicht", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    const el = fieldEl(container, "b1", "headline");
    act(() => {
      el.focus();
      el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      el.textContent = "Vom Nutzer getippt";
    });
    dispatchFromStudio(createMessage("ek:update", { blockId: "b1", props: { headline: "Echo vom Studio" } }));
    expect(fieldEl(container, "b1", "headline").textContent).toBe("Vom Nutzer getippt");
  });
});
```

> `act`, `vi` sind bereits importiert. Passe den `content`-Fixture nicht an – `b1` (Hero, `headline`) und `b2` (Text, `body`) genügen.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @editkraft/react test -- preview`
Expected: FAIL (kein `contenteditable`, kein `ek:update`/`ek:focus-field` aus dem Preview).

- [ ] **Step 3: Implement** — `packages/react/src/preview.tsx` überarbeiten. Import ergänzen:

```ts
import { createElement, Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  parseMessage,
  createMessage,
  isAllowedOrigin,
  sanitizeRichText,
  type Block,
  type EkFieldKind,
  type PageContent,
} from "@editkraft/schema";
```

In `EditkraftPreview` einen Container-Ref und einen Fokus-Ref anlegen und die Effekt-Logik erweitern. Ersetze den Rumpf ab `const [selectedId, ...]` bis zum `return` durch:

```ts
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef<{ blockId: string; fieldKey: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feld-kind eines Blocks über die Registry auflösen.
  const fieldKindOf = (blockType: string, fieldKey: string): EkFieldKind | undefined =>
    registry.get(blockType)?.definition.fields.find((f) => f.key === fieldKey)?.kind;

  const blockTypeOf = (blockId: string): string | undefined => {
    const find = (blocks: Block[]): string | undefined => {
      for (const b of blocks) {
        if (b.id === blockId) return b.type;
        if (b.children) {
          const t = find(b.children);
          if (t) return t;
        }
      }
      return undefined;
    };
    return find(tree.blocks);
  };

  useEffect(() => {
    postToStudio(createMessage("ek:ready", { schemaVersion: content.schemaVersion }), studioOrigin);
    postToStudio(createMessage("ek:schema", { blocks: registry.descriptors() }), studioOrigin);
    postToStudio(createMessage("ek:tree", { content }), studioOrigin);

    const onMessage = (event: MessageEvent) => {
      if (!isAllowedOrigin(event.origin, studioOrigin)) return;
      const message = parseMessage(event.data);
      if (!message) return;
      if (message.type === "ek:update") {
        const focused = focusedRef.current;
        let props = message.props;
        // Echo-Guard: das gerade editierte Feld nicht aus dem Studio zurücksetzen.
        if (focused && focused.blockId === message.blockId && focused.fieldKey in props) {
          const fk = focused.fieldKey;
          props = Object.fromEntries(Object.entries(props).filter(([k]) => k !== fk));
        }
        if (Object.keys(props).length > 0) {
          setTree((current) => updateBlockProps(current, message.blockId, props));
        }
      } else if (message.type === "ek:select") {
        setSelectedId(message.blockId);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioOrigin]);

  // Nach jedem Render: data-ek-field-Elemente editierbar machen.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-ek-field]"))) {
      const wrapper = el.closest<HTMLElement>("[data-editkraft-block-id]");
      const blockId = wrapper?.getAttribute("data-editkraft-block-id") ?? undefined;
      const fieldKey = el.getAttribute("data-ek-field") ?? undefined;
      if (!blockId || !fieldKey) continue;
      const type = blockTypeOf(blockId);
      const kind = type ? fieldKindOf(type, fieldKey) : undefined;
      if (kind === "text" || kind === "richText") {
        el.setAttribute("contenteditable", "true");
      }
    }
  });

  const currentValueFromDom = (el: HTMLElement, kind: EkFieldKind): string =>
    kind === "richText" ? sanitizeRichText(el.innerHTML) : (el.textContent ?? "");

  const sendUpdateDebounced = (blockId: string, fieldKey: string, value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      postToStudio(createMessage("ek:update", { blockId, props: { [fieldKey]: value } }), studioOrigin);
    }, 300);
  };

  const resolveField = (target: HTMLElement) => {
    const el = target.closest<HTMLElement>("[data-ek-field]");
    if (!el) return null;
    const wrapper = el.closest<HTMLElement>("[data-editkraft-block-id]");
    const blockId = wrapper?.getAttribute("data-editkraft-block-id") ?? null;
    const fieldKey = el.getAttribute("data-ek-field") ?? null;
    if (!blockId || !fieldKey) return null;
    const type = blockTypeOf(blockId);
    const kind = type ? fieldKindOf(type, fieldKey) : undefined;
    if (kind !== "text" && kind !== "richText") return null;
    return { el, blockId, fieldKey, kind };
  };

  const onInput = (e: { target: EventTarget | null }) => {
    const f = resolveField(e.target as HTMLElement);
    if (!f) return;
    sendUpdateDebounced(f.blockId, f.fieldKey, currentValueFromDom(f.el, f.kind));
  };

  const onFocusIn = (e: { target: EventTarget | null }) => {
    const f = resolveField(e.target as HTMLElement);
    if (!f) return;
    focusedRef.current = { blockId: f.blockId, fieldKey: f.fieldKey };
    postToStudio(createMessage("ek:focus-field", { blockId: f.blockId, fieldKey: f.fieldKey }), studioOrigin);
  };

  const onFocusOut = (e: { target: EventTarget | null }) => {
    const f = resolveField(e.target as HTMLElement);
    focusedRef.current = null;
    if (!f) return;
    // Finalen (sanitisierten) Wert in den lokalen State übernehmen.
    const value = currentValueFromDom(f.el, f.kind);
    setTree((current) => updateBlockProps(current, f.blockId, { [f.fieldKey]: value }));
  };

  const onSelect = (id: string) => {
    setSelectedId(id);
    postToStudio(createMessage("ek:select", { blockId: id }), studioOrigin);
  };

  return createElement(
    "div",
    { ref: containerRef, onInput, onFocusCapture: onFocusIn, onBlurCapture: onFocusOut },
    createElement(PreviewBlocks, { blocks: tree.blocks, registry, selectedId, onSelect }),
  );
```

> Hinweise: `onFocusCapture`/`onBlurCapture` fangen `focusin`/`focusout` per React-Delegation am Container. `onInput` am Container fängt Eingaben aus contentEditable-Kindern. Der zweite `useEffect` (ohne Dep-Array) läuft nach jedem Render und macht neu gerenderte Felder editierbar – idempotent, weil `setAttribute` bestehende Werte nur bestätigt.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @editkraft/react test -- preview`
Expected: PASS (inkl. der 4 neuen Inline-Fälle und der bestehenden Bridge-Tests).

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/preview.tsx packages/react/src/preview.test.tsx
git commit -m "feat(react): inline-edit data-ek-field elements (contentEditable, ek:update, ek:focus-field, echo-guard)"
```

---

### Task 4: Renderer – RichText-Mini-Toolbar (Fett/Kursiv/Link)

**Files:**
- Modify: `packages/react/src/preview.tsx`
- Test: `packages/react/src/preview.test.tsx`

**Interfaces:**
- Consumes: das `focusedRef`/`resolveField`-Setup aus Task 3, `fieldKindOf`.
- Produces: bei nicht-leerer Selektion innerhalb eines `richText`-Feldes eine schwebende Toolbar (`data-editkraft-toolbar`) mit Buttons `Fett`, `Kursiv`, `Link`; Klick wendet Formatierung auf die Selektion an und triggert ein `ek:update`.

**Hintergrund:** Die Toolbar lebt im iframe-Dokument (Teil des Preview-React-Trees). Sie hört auf `selectionchange`, ist sichtbar, wenn die aktuelle Selektion nicht leer ist und im aktuell fokussierten `richText`-Feld liegt, und positioniert sich über der Selektions-Bounding-Box. Fett/Kursiv über `document.execCommand("bold"|"italic")` (breit unterstützt, einfachster Weg innerhalb contentEditable); Link über `execCommand("createLink", false, href)` nach `window.prompt`. Nach jeder Aktion wird der Feldwert (sanitisiert) als `ek:update` gemeldet.

- [ ] **Step 1: Failing test** — an `packages/react/src/preview.test.tsx` anhängen. Ergänze in der Test-Registry einen RichText-Block:

```tsx
function Prose({ body }: { body: string }) {
  return <div data-ek-field="body" dangerouslySetInnerHTML={{ __html: body }} />;
}
```

Registry um einen Eintrag erweitern (nach `Text`):

```ts
{ definition: defineBlock({ type: "Prose", label: "Prosa", schema: z.object({ body: ekRichText() }) }), component: Prose },
```

`ekRichText` in den Import aus `@editkraft/schema` aufnehmen. Content-Fixture um einen Prose-Block ergänzen:

```ts
    { id: "b3", type: "Prose", props: { body: "<strong>fett</strong> normal" } },
```

Dann Test:

```ts
describe("RichText-Mini-Toolbar", () => {
  it("erscheint bei nicht-leerer Selektion in einem richText-Feld", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    const el = fieldEl(container, "b3", "body");
    act(() => {
      el.focus();
      el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(container.querySelector('[data-editkraft-toolbar]')).toBeTruthy();
  });

  it("bleibt bei leerer/kollabierter Selektion verborgen", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    act(() => {
      window.getSelection()?.removeAllRanges();
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(container.querySelector('[data-editkraft-toolbar]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @editkraft/react test -- preview`
Expected: FAIL (kein `data-editkraft-toolbar`).

- [ ] **Step 3: Implement** — in `packages/react/src/preview.tsx`. State für die Toolbar ergänzen (bei den anderen `useState`):

```ts
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
```

Effekt für `selectionchange` (nach dem Feld-Binding-Effekt) einfügen:

```ts
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = typeof window !== "undefined" ? window.getSelection() : null;
      const focused = focusedRef.current;
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !focused) {
        setToolbar(null);
        return;
      }
      const type = blockTypeOf(focused.blockId);
      const kind = type ? fieldKindOf(type, focused.fieldKey) : undefined;
      if (kind !== "richText") {
        setToolbar(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setToolbar({ top: Math.max(0, rect.top - 40), left: rect.left });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Formatierungs-Handler (vor dem `return`):

```ts
  const applyFormat = (command: "bold" | "italic" | "link") => {
    const focused = focusedRef.current;
    if (!focused) return;
    if (command === "link") {
      const href = typeof window !== "undefined" ? window.prompt("Link-Ziel (https://…)") : null;
      if (href) document.execCommand("createLink", false, href);
    } else {
      document.execCommand(command);
    }
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-editkraft-block-id="${focused.blockId}"] [data-ek-field="${focused.fieldKey}"]`,
    );
    if (el) sendUpdateDebounced(focused.blockId, focused.fieldKey, sanitizeRichText(el.innerHTML));
  };
```

Das `return` um die Toolbar erweitern (als Geschwister der `PreviewBlocks`):

```ts
  return createElement(
    "div",
    { ref: containerRef, onInput, onFocusCapture: onFocusIn, onBlurCapture: onFocusOut },
    createElement(PreviewBlocks, { blocks: tree.blocks, registry, selectedId, onSelect }),
    toolbar
      ? createElement(
          "div",
          {
            "data-editkraft-toolbar": "true",
            style: {
              position: "fixed",
              top: toolbar.top,
              left: toolbar.left,
              display: "flex",
              gap: 4,
              padding: 4,
              background: "#111827",
              borderRadius: 6,
              zIndex: 2147483647,
            },
            // Toolbar-Klicks dürfen die Selektion nicht verlieren.
            onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
          },
          createElement("button", { type: "button", onClick: () => applyFormat("bold"), style: toolbarBtn }, "B"),
          createElement("button", { type: "button", onClick: () => applyFormat("italic"), style: toolbarBtn }, "i"),
          createElement("button", { type: "button", onClick: () => applyFormat("link"), style: toolbarBtn }, "🔗"),
        )
      : null,
  );
```

Und eine Stil-Konstante oben im Modul (nach den Imports):

```ts
const toolbarBtn = {
  color: "#fff",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
  padding: "2px 8px",
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @editkraft/react test -- preview`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/preview.tsx packages/react/src/preview.test.tsx
git commit -m "feat(react): floating rich-text mini-toolbar (bold/italic/link)"
```

---

### Task 5: Renderer – Bild-Feld-Overlay „Bild ersetzen"

**Files:**
- Modify: `packages/react/src/preview.tsx`
- Test: `packages/react/src/preview.test.tsx`

**Interfaces:**
- Consumes: `resolveField`-Muster (aber für `kind === "image"`), `postToStudio`.
- Produces: Klick auf ein `data-ek-field` mit `kind:image` sendet `ek:select` + `ek:focus-field`; das Bildfeld ist **nicht** contentEditable.

**Hintergrund:** Bilder werden nicht inline editiert. Ein Klick auf ein Bild-Feld selektiert den Block und meldet `ek:focus-field`, damit das Studio das Bildfeld in der Sidebar fokussiert. Der sichtbare „Bild ersetzen"-Button ist ein reines Hover-Affordance; die Testbarkeit hängt am gesendeten `ek:focus-field`.

- [ ] **Step 1: Failing test** — an `preview.test.tsx` anhängen. Ergänze eine Bild-Testkomponente + Registry-Eintrag:

```tsx
function Banner({ image }: { image: { url?: string; alt?: string } }) {
  return <div data-ek-field="image"><img src={image?.url ?? ""} alt={image?.alt ?? ""} /></div>;
}
```

Registry (nach `Prose`), `ekImage` importieren:

```ts
{ definition: defineBlock({ type: "Banner", label: "Banner", schema: z.object({ image: ekImage() }) }), component: Banner },
```

Content-Fixture ergänzen:

```ts
    { id: "b4", type: "Banner", props: { image: { assetId: "", url: "" } } },
```

Test:

```ts
describe("Bild-Feld", () => {
  it("ist nicht contentEditable", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    expect(fieldEl(container, "b4", "image").getAttribute("contenteditable")).toBeNull();
  });

  it("Klick meldet ek:focus-field mit dem Bildfeld", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    post.mockClear();
    fireEvent.click(fieldEl(container, "b4", "image"));
    const focus = post.mock.calls.map((c) => c[0] as { type: string; fieldKey?: string; blockId?: string }).find((x) => x.type === "ek:focus-field");
    expect(focus?.blockId).toBe("b4");
    expect(focus?.fieldKey).toBe("image");
    post.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @editkraft/react test -- preview`
Expected: FAIL (kein `ek:focus-field` beim Bild-Klick).

- [ ] **Step 3: Implement** — in `preview.tsx` einen Klick-Handler am Container ergänzen, der Bild-Felder erkennt. Erweitere `resolveField` NICHT (die filtert Text/RichText); füge stattdessen eine separate Auflösung hinzu und einen `onClickCapture` am Container:

```ts
  const onClickCapture = (e: { target: EventTarget | null }) => {
    const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-ek-field]");
    if (!el) return;
    const wrapper = el.closest<HTMLElement>("[data-editkraft-block-id]");
    const blockId = wrapper?.getAttribute("data-editkraft-block-id") ?? null;
    const fieldKey = el.getAttribute("data-ek-field") ?? null;
    if (!blockId || !fieldKey) return;
    const type = blockTypeOf(blockId);
    const kind = type ? fieldKindOf(type, fieldKey) : undefined;
    if (kind === "image") {
      postToStudio(createMessage("ek:select", { blockId }), studioOrigin);
      postToStudio(createMessage("ek:focus-field", { blockId, fieldKey }), studioOrigin);
    }
  };
```

Den Container-`createElement`-Aufruf um `onClickCapture` erweitern:

```ts
    { ref: containerRef, onInput, onClickCapture, onFocusCapture: onFocusIn, onBlurCapture: onFocusOut },
```

> Der Feld-Binding-Effekt aus Task 3 setzt `contentEditable` nur für `text`/`richText` – `image` bleibt dadurch automatisch nicht editierbar. Kein zusätzlicher Code nötig, der Test „ist nicht contentEditable" grünt allein durch Task 3.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @editkraft/react test -- preview`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/preview.tsx packages/react/src/preview.test.tsx
git commit -m "feat(react): image field click reports ek:focus-field (Bild ersetzen path)"
```

---

### Task 6: Beispiel-App auf `data-ek-field` umstellen (Verifikations-Oberfläche)

**Files:**
- Modify: `apps/example/blocks/Hero.tsx`
- Modify: `apps/example/blocks/registry.ts`
- Test: `apps/example/tests/render.integration.test.tsx`

**Interfaces:**
- Consumes: `sanitizeRichText`, `ekRichText` aus `@editkraft/schema`.
- Produces: Hero rendert `headline` (`data-ek-field="headline"`), ein neues `body` (`ekRichText`, sanitisiert ausgegeben, `data-ek-field="body"`) und das Bild (`data-ek-field="image"`) – die manuelle Browser-Verifikation hat damit alle drei Feldtypen.

- [ ] **Step 1: Failing test** — in `apps/example/tests/render.integration.test.tsx` einen Fall ergänzen, der prüft, dass der gerenderte Hero die `data-ek-field`-Marker trägt und RichText sanitisiert ausgibt. (Öffne die Datei, füge innerhalb der bestehenden `describe` einen `it`-Block ein — Muster an den vorhandenen Tests orientieren.)

```tsx
it("Hero trägt data-ek-field-Marker und gibt RichText sanitisiert aus", () => {
  const html = renderToStaticMarkup(
    renderBlocks(
      [{ id: "h", type: "Hero", props: {
        headline: "Titel",
        body: '<b>fett</b><script>alert(1)</script>',
        image: { assetId: "", url: "" },
      } }],
      registry,
    ),
  );
  expect(html).toContain('data-ek-field="headline"');
  expect(html).toContain('data-ek-field="body"');
  expect(html).toContain("<strong>fett</strong>");
  expect(html).not.toContain("<script>");
});
```

> Falls `renderToStaticMarkup`/`renderBlocks`/`registry` in der Testdatei noch nicht importiert sind: `import { renderToStaticMarkup } from "react-dom/server";`, `import { renderBlocks } from "@editkraft/react";`, `import { registry } from "@/blocks/registry";` (Alias wie in den bestehenden Beispiel-Tests) ergänzen.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @editkraft/example test -- render.integration`
Expected: FAIL (`body`-Feld/Marker fehlen). Falls der Paketname abweicht: `pnpm --filter ./apps/example test`.

- [ ] **Step 3: Implement** — `apps/example/blocks/Hero.tsx` ersetzen:

```tsx
import { sanitizeRichText, type EkImageValue, type EkLinkValue } from "@editkraft/schema";

/**
 * Beispiel-Block. `data-ek-field` bindet Elemente an ihre Felder – das Studio
 * macht sie im Editor direkt anklick- und editierbar. RichText wird über den
 * kanonischen Sanitizer ausgegeben.
 */
export function Hero({
  headline,
  body,
  image,
  cta,
}: {
  headline: string;
  body?: string;
  image: EkImageValue;
  cta?: EkLinkValue;
}) {
  return (
    <section>
      <h1 data-ek-field="headline">{headline}</h1>
      {body ? <div data-ek-field="body" dangerouslySetInnerHTML={{ __html: sanitizeRichText(body) }} /> : null}
      <div data-ek-field="image">
        {image?.url ? <img src={image.url} alt={image.alt ?? ""} /> : null}
      </div>
      {cta ? <a href={cta.href}>{cta.label ?? cta.href}</a> : null}
    </section>
  );
}
```

`apps/example/blocks/registry.ts` – Schema um `body` erweitern und `ekRichText` importieren:

```ts
import { defineBlock, ekText, ekRichText, ekImage, ekLink } from "@editkraft/schema";
```

```ts
      schema: z.object({
        headline: ekText({ label: "Überschrift" }),
        body: ekRichText({ label: "Fließtext" }).optional(),
        image: ekImage({ label: "Bild" }),
        cta: ekLink({ label: "Button" }).optional(),
      }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @editkraft/example test -- render.integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/example/blocks/Hero.tsx apps/example/blocks/registry.ts apps/example/tests/render.integration.test.tsx
git commit -m "feat(example): bind Hero fields with data-ek-field + sanitized richText body"
```

---

### Task 7: Changeset + Contract-Doku + Grün-Check

**Files:**
- Create: `.changeset/direct-manipulation.md`
- Modify: `docs/CONTRACT.md`
- Modify: `docs/DECISIONS.md`

**Interfaces:**
- Produces: Minor-Release-Notiz für `@editkraft/schema` und `@editkraft/react`; aktualisierte Contract-Doku (neue Message, RichText-Format).

- [ ] **Step 1: Changeset** — `.changeset/direct-manipulation.md`:

```markdown
---
"@editkraft/schema": minor
"@editkraft/react": minor
---

Direct Manipulation im Preview: neue `ek:focus-field`-Nachricht, `ek:update` als
bidirektionales Protokoll dokumentiert, dependency-freier `sanitizeRichText` +
`RICH_TEXT_ALLOWLIST` (RichText-Speicherformat = sanitisiertes HTML-Subset).
Renderer/Preview-Bridge macht `data-ek-field`-Elemente inline editierbar
(contentEditable, Mini-Toolbar für RichText, Bild-Klick → `ek:focus-field`).
```

- [ ] **Step 2: CONTRACT.md aktualisieren** — im postMessage-Abschnitt die Tabelle um die Zeile ergänzen und `ek:update` als bidirektional markieren:

```markdown
| `ek:update` | beide | `blockId`, `props` (Studio setzt / Preview meldet Inline-Edit) |
| `ek:focus-field` | Preview → Studio | `blockId`, `fieldKey` (Feld fokussiert / Bild-Klick) |
```

Und im Feld-Primitives-Abschnitt die `ekRichText`-Zeile präzisieren:

```markdown
| `ekRichText({ label? })` | `string` (sanitisiertes HTML, siehe `sanitizeRichText`) | `richText` |
```

Sowie einen kurzen Absatz unter der Primitives-Tabelle:

```markdown
**Rich-Text-Format:** `ekRichText` speichert ein sanitisiertes HTML-Subset. Die
Allowlist (`RICH_TEXT_ALLOWLIST`: `strong`, `em`, `a[href]`) und die reine Funktion
`sanitizeRichText(html)` sind exportiert; Renderer (Ausgabe) und Inline-Editor
(Eingabe) nutzen denselben Sanitizer. `data-ek-field="<key>"` am DOM-Element bindet
es an sein Feld und macht es im Studio direkt editierbar.
```

- [ ] **Step 3: DECISIONS.md ergänzen** — einen ADR-Eintrag anfügen:

```markdown
## ADR-0XX: Direct Manipulation – data-ek-field-Binding, HTML-Subset-RichText, Echo-Guard
Inline-Editing bindet Elemente per `data-ek-field`-Attribut (kein Wrapper, kein Import,
Server-Component-tauglich); die Bridge löst den Feld-`kind` über die Registry auf.
`ekRichText` wird als sanitisiertes HTML-Subset gespeichert – ein kanonischer,
dependency-freier `sanitizeRichText` (rebuild-from-scratch, `href`-Protokoll-Allowlist,
idempotent) wird von Renderer und Editor geteilt. `ek:update` ist bidirektional;
`ek:focus-field` neu. Kernrisiko React↔DOM gelöst über den **Echo-Guard**: das
fokussierte Feld ist uncontrolled – eingehendes `ek:update` überschreibt es nicht, der
finale Wert wird erst bei Blur in den State übernommen.
```

> Ersetze `0XX` durch die nächste freie ADR-Nummer in der Datei.

- [ ] **Step 4: Grün-Check über alle betroffenen Pakete**

Run: `pnpm --filter @editkraft/schema --filter @editkraft/react --filter @editkraft/example test && pnpm --filter @editkraft/schema --filter @editkraft/react build`
Expected: alle Tests PASS, Builds ohne Fehler.

- [ ] **Step 5: Commit**

```bash
git add .changeset/direct-manipulation.md docs/CONTRACT.md docs/DECISIONS.md
git commit -m "docs(schema): changeset + contract/decisions for direct manipulation"
```

---

## Release-Handoff (nach Merge)

- PR gegen `main` (OSS-Repo), CI grün. Nach Merge erzeugt Changesets die Versionen –
  erwartet: `@editkraft/schema@0.3.0`, `@editkraft/react@0.4.0`. Diese Nummern nutzt
  Plan 2 (Studio) zum Pinnen.
- Manuelle Browser-Verifikation im Beispiel-Testbett (`apps/example`, Draft-Preview):
  Text anklicken und lostippen, Wort markieren → Fett, Bild anklicken → `ek:focus-field`
  im Studio-Log.

## Self-Review-Notiz

Deckung geprüft gegen Spec-Abschnitte: Feld-Binding (T3/T6), `ek:focus-field` (T1/T3/T5),
bidirektionales `ek:update` (T1/T3), `sanitizeRichText`/Allowlist (T2/T6), Mini-Toolbar
(T4), Bild-Klick (T5), Echo-Guard (T3), Tests (jede Task), Contract-Doku (T7). Keine
Platzhalter; Signaturen (`sanitizeRichText`, `ek:focus-field`, `resolveField`,
`focusedRef`) konsistent über die Tasks.
