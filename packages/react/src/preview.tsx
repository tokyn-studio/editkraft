"use client";

import {
  createElement,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  parseMessage,
  createMessage,
  isAllowedOrigin,
  sanitizeRichText,
  imageFrameStyles,
  DEFAULT_IMAGE_FRAME,
  type Block,
  type EkFieldKind,
  type EkImageFrame,
  type EkSelectOption,
  type GlobalsDefinition,
  type PageContent,
} from "@editkraft/schema";
import type { Registry } from "./registry";
import { updateBlockProps } from "./tree";

export interface EditkraftPreviewProps {
  /** Draft-Content, serverseitig (Draft Mode) geladen und übergeben. */
  content: PageContent;
  registry: Registry;
  /** Erlaubte Studio-Origin (Ziel für postMessage und Origin-Check eingehender Nachrichten). */
  studioOrigin: string;
  /**
   * Site-Globals: Definition + serverseitig geladene Draft-Werte
   * (loadDraftGlobals ?? Code-Defaults). Wenn gesetzt, meldet die Preview
   * ek:globals an das Studio und macht `data-ek-global="<key>"`-Elemente
   * inline editierbar (kind text/richText).
   */
  globals?: { definition: GlobalsDefinition; values: Record<string, unknown> };
}

function postToStudio(message: unknown, origin: string): void {
  if (typeof window === "undefined") return;
  // In der echten Nutzung ist window.parent das Studio-iframe.
  window.parent.postMessage(message, origin);
}

function PreviewBlocks({
  blocks,
  registry,
  onSelect,
  globals,
}: {
  blocks: Block[];
  registry: Registry;
  onSelect: (id: string) => void;
  globals?: Record<string, unknown> | undefined;
}): ReactNode {
  return createElement(
    Fragment,
    null,
    ...blocks.map((block) => {
      const entry = registry.get(block.type);
      const parsed = entry?.definition.schema.safeParse(block.props);
      const inner =
        entry && parsed?.success
          ? createElement(entry.component, {
              // Vor den validierten Props (wie im Renderer): ein Block mit
              // eigenem `globals`-Feld behält seinen eigenen Wert.
              ...(globals !== undefined ? { globals } : {}),
              ...(parsed.data as Record<string, unknown>),
              children:
                block.children && block.children.length > 0
                  ? createElement(PreviewBlocks, {
                      blocks: block.children,
                      registry,
                      onSelect,
                      globals,
                    })
                  : undefined,
            })
          : createElement("div", { style: { padding: 8, color: "#92400e" } }, `Block "${block.type}"`);

      // Klick-Overlay pro Block: Selektion an das Studio melden. Das Auswahl-Outline
      // wird NICHT hier (React) gesetzt, sondern imperativ per Effekt – sonst würde
      // jede Auswahländerung diesen Block (inkl. contentEditable-Feld) neu rendern
      // und die laufende Text-Selektion/den Cursor zerstören.
      return createElement(
        "div",
        {
          key: block.id,
          "data-editkraft-block-id": block.id,
          onClick: (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            onSelect(block.id);
          },
          style: { cursor: "pointer" },
        },
        inner,
      );
    }),
  );
}

/**
 * Preview-Bridge (Client Component). Wird ausschließlich im Next.js Draft Mode
 * gerendert. Sie:
 *  - meldet sich beim Studio (ek:ready) und sendet den Blocktree (ek:tree),
 *  - legt Klick-Overlays über registrierte Blöcke (Klick → ek:select),
 *  - empfängt ek:update (Live-Prop-Update) und ek:select (Auswahl setzen),
 *    jeweils nach Origin-Check gegen studioOrigin.
 *
 * Item-Modus (Collections, Roadmap 2.8) — Entscheidung: KEINE eigenen Props
 * (`collection`/`itemId`) und kein zweiter Render-Pfad. Die Preview-SEITE baut
 * per `itemToBlock(slug, itemId, draftData)` einen synthetischen Ein-Block-Baum
 * (`type = "$collection:<slug>"`, `blockId = itemId`) und übergibt ihn als
 * ganz normales `content`. Die Registry registriert jede Collection intern als
 * synthetischen Block unter genau diesem Typ (siehe createRegistry), wodurch
 * hier ALLES unverändert funktioniert: `registry.get()` liefert das Template
 * (samt Collection-Zod-Schema), `fieldKindOf` liest die Collection-Feld-
 * Deskriptoren, `registry.descriptors()` sendet sie in ek:schema mit, und
 * contenteditable/Toolbar/Popover/ek:update laufen über die bestehende Bridge.
 * Das ist die minimal-invasive Variante: null Sonderfälle in dieser Datei,
 * das Studio sieht eine „Seite mit einem Block".
 */
export function EditkraftPreview({
  content,
  registry,
  studioOrigin,
  globals,
}: EditkraftPreviewProps): ReactNode {
  const [tree, setTree] = useState<PageContent>(content);
  // Globals-Werte: initial die serverseitig geladenen Draft-Werte; aktualisiert
  // beim Verlassen eines data-ek-global-Felds bzw. durch eingehende Updates.
  const [globalValues, setGlobalValues] = useState<Record<string, unknown>>(
    globals?.values ?? {},
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
  const [fmt, setFmt] = useState<{
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    ul: boolean;
    ol: boolean;
    block: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef<{ blockId: string; fieldKey: string } | null>(null);
  // Fokussiertes Globals-Feld (data-ek-global) — getrennt von focusedRef,
  // weil Globals keine blockId haben und keine Format-Toolbar bekommen (v1).
  const focusedGlobalRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const globalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  // Zuletzt bekannte Selektion im fokussierten Feld – wird vor execCommand
  // wiederhergestellt, falls der Toolbar-Klick sie kurz verliert.
  const savedRangeRef = useRef<Range | null>(null);

  // Link-Bearbeiten-Popover (für cta-Button-Felder UND Inline-<a> in richText).
  const [linkPopover, setLinkPopover] = useState<{
    mode: "cta" | "inline";
    blockId: string;
    fieldKey: string;
    top: number;
    left: number;
    type: "url" | "mail" | "tel";
    value: string;
    label: string;
  } | null>(null);
  const linkElRef = useRef<HTMLAnchorElement | null>(null);
  const popoverOpenRef = useRef(false);
  const [pages, setPages] = useState<{ slug: string; title: string }[]>([]);

  // Options-Popover für select-Felder (strikte Enums, z. B. Icon-Schlüssel).
  const [selectPopover, setSelectPopover] = useState<{
    blockId: string;
    fieldKey: string;
    top: number;
    left: number;
    options: EkSelectOption[];
    current: string;
  } | null>(null);

  // Medien-Bearbeiten-Popover (Austausch per URL / Datei / Drag&Drop, Alt-Text;
  // Umschalter Bild ⇄ Video, Poster + Steuerelemente für Videos).
  const [imagePopover, setImagePopover] = useState<{
    blockId: string;
    fieldKey: string;
    top: number;
    left: number;
    url: string;
    alt: string;
    kind: "image" | "video";
    poster: string;
    controls: boolean;
    status: "idle" | "uploading" | "error";
    errorMsg?: string | undefined;
  } | null>(null);

  // Hervorgehobenes Bild-Feld während eines Studio-Medien-Drags (Ref, weil das
  // Hervorheben über eingehende Nachrichten läuft, nicht über Render-State).
  const mediaHighlightRef = useRef<HTMLElement | null>(null);

  // Zuschneiden-Modus (non-destruktives 1:1-Framing: Pan per Ziehen, Zoom per Slider/Scroll).
  const [cropMode, setCropMode] = useState<{
    blockId: string;
    fieldKey: string;
    rect: { top: number; left: number; width: number; height: number };
    frame: EkImageFrame;
  } | null>(null);
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  const cropDragRef = useRef<{ startX: number; startY: number; startFrame: EkImageFrame } | null>(null);

  // Feld-kind eines Blocks über die Registry auflösen.
  const fieldKindOf = (blockType: string, fieldKey: string): EkFieldKind | undefined =>
    registry.get(blockType)?.definition.fields.find((f) => f.key === fieldKey)?.kind;

  // Feld-kind eines Site-Globals über die Definition auflösen.
  const globalKindOf = (key: string): EkFieldKind | undefined =>
    globals?.definition.fields.find((f) => f.key === key)?.kind;

  /**
   * Spielt Globals-Werte imperativ in alle data-ek-global-Vorkommen AUSSERHALB
   * des Canvas (Site-Chrome wie Header/Footer, serverseitig gerendert — React
   * erreicht sie nicht). Im Canvas übernimmt das der globals-Prop-Fluss.
   */
  const applyGlobalsToChrome = (values: Record<string, unknown>) => {
    if (typeof document === "undefined") return;
    const root = containerRef.current;
    for (const [key, value] of Object.entries(values)) {
      const kind = globalKindOf(key);
      if (kind !== "text" && kind !== "richText") continue;
      const esc =
        typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>(`[data-ek-global="${esc}"]`),
      )) {
        if (root && root.contains(el)) continue;
        if (kind === "richText") el.innerHTML = sanitizeRichText(String(value ?? ""));
        else el.textContent = String(value ?? "");
      }
    }
  };

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

  const clearMediaHighlight = () => {
    const el = mediaHighlightRef.current;
    if (el) {
      el.style.outline = "";
      el.style.outlineOffset = "";
      mediaHighlightRef.current = null;
    }
  };

  // Bild-Feld an einer Viewport-Koordinate (aus dem Studio-Drag). Statt nativer
  // Drag-Events (die eine cross-origin-iframe-Grenze nicht zuverlässig überqueren)
  // schickt das Studio Cursor-Koordinaten; hier wird per elementFromPoint getroffen.
  const imageFieldAtPoint = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const field = el?.closest?.<HTMLElement>("[data-ek-field]") ?? null;
    if (!field) return null;
    const wrapper = field.closest<HTMLElement>("[data-editkraft-block-id]");
    const blockId = wrapper?.getAttribute("data-editkraft-block-id") ?? null;
    const fieldKey = field.getAttribute("data-ek-field") ?? null;
    if (!blockId || !fieldKey) return null;
    const type = blockTypeOf(blockId);
    if (!type || fieldKindOf(type, fieldKey) !== "image") return null;
    return { field, blockId, fieldKey };
  };

  useEffect(() => {
    postToStudio(createMessage("ek:ready", { schemaVersion: content.schemaVersion }), studioOrigin);
    postToStudio(createMessage("ek:schema", { blocks: registry.descriptors() }), studioOrigin);
    postToStudio(createMessage("ek:tree", { content }), studioOrigin);
    if (globals) {
      postToStudio(
        createMessage("ek:globals", {
          fields: globals.definition.fields,
          values: globals.values,
        }),
        studioOrigin,
      );
    }

    const onMessage = (event: MessageEvent) => {
      if (!isAllowedOrigin(event.origin, studioOrigin)) return;
      // Roh-Nachrichten (kein Schema-Typ): Drag&Drop eines Bildes aus der Studio-
      // Medienbibliothek über den Canvas. Das Studio managt den Pointer-Drag (mit
      // Overlay) und schickt Cursor-Koordinaten; hier wird per elementFromPoint das
      // getroffene Bild-Feld ermittelt, hervorgehoben und beim Ablegen via
      // ek:media-drop (blockId/fieldKey) zurückgemeldet. So unabhängig davon, dass
      // native Drag-Events die cross-origin-iframe-Grenze nicht überqueren.
      const raw = event.data as { channel?: string; type?: string; x?: number; y?: number } | null;
      if (raw && raw.channel === "editkraft" && raw.type === "ek:media-drag-start") {
        return; // Beginn – nichts zu tun; Highlight kommt mit ek:media-drag-move
      }
      if (raw && raw.channel === "editkraft" && raw.type === "ek:media-drag-end") {
        clearMediaHighlight();
        return;
      }
      if (raw && raw.channel === "editkraft" && raw.type === "ek:media-drag-move") {
        const hit = imageFieldAtPoint(Number(raw.x), Number(raw.y));
        if (hit) {
          if (mediaHighlightRef.current !== hit.field) {
            clearMediaHighlight();
            mediaHighlightRef.current = hit.field;
            hit.field.style.outline = "2px solid #f5a623";
            hit.field.style.outlineOffset = "2px";
          }
        } else {
          clearMediaHighlight();
        }
        return;
      }
      if (raw && raw.channel === "editkraft" && raw.type === "ek:media-drop-at") {
        const hit = imageFieldAtPoint(Number(raw.x), Number(raw.y));
        if (hit) {
          postToStudio(
            { channel: "editkraft", v: 1, type: "ek:media-drop", blockId: hit.blockId, fieldKey: hit.fieldKey },
            studioOrigin,
          );
        }
        clearMediaHighlight();
        return;
      }
      const message = parseMessage(event.data);
      if (!message) return;
      if (message.type === "ek:tree") {
        // Struktur-Edits aus dem Studio (Blockliste: einfügen/löschen/
        // verschieben): kompletten Baum ersetzen — Live-Canvas ohne Reload.
        // Kein Echo-Guard nötig: Struktur-Ops passieren nie während des
        // Tippens in einem Feld (das Studio sendet sie nur aus dem Panel).
        setTree(message.content);
        return;
      }
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
      } else if (message.type === "ek:global-update") {
        // Echo-Guard wie bei ek:update: das gerade editierte Global nicht
        // aus dem Studio zurücksetzen.
        const focusedKey = focusedGlobalRef.current;
        const values = Object.fromEntries(
          Object.entries(message.values).filter(([k]) => k !== focusedKey),
        );
        if (Object.keys(values).length > 0) {
          setGlobalValues((current) => ({ ...current, ...values }));
          applyGlobalsToChrome(values);
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
      // Nur setzen, wenn noch nicht gesetzt: erneutes setAttribute bei jedem Render
      // würde die Selektion/den Cursor zurücksetzen (→ Tippen unmöglich, Endlos-Loop
      // mit der selectionchange-getriebenen Toolbar).
      if ((kind === "text" || kind === "richText") && el.getAttribute("contenteditable") !== "true") {
        el.setAttribute("contenteditable", "true");
      }
    }
    // Site-Globals: data-ek-global-Elemente im Canvas ebenso editierbar machen.
    if (globals) {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-ek-global]"))) {
        const key = el.getAttribute("data-ek-global") ?? "";
        const kind = globalKindOf(key);
        if (
          (kind === "text" || kind === "richText") &&
          el.getAttribute("contenteditable") !== "true"
        ) {
          el.setAttribute("contenteditable", "true");
        }
      }
    }
  });

  // Selektions-/Fokusänderung → Toolbar neu positionieren + Aktiv-Status lesen.
  // Immer über refreshRef, damit die aktuelle Closure (tree) genutzt wird.
  useEffect(() => {
    const h = () => refreshRef.current();
    document.addEventListener("selectionchange", h);
    return () => document.removeEventListener("selectionchange", h);
  }, []);

  const currentValueFromDom = (el: HTMLElement, kind: EkFieldKind): string =>
    kind === "richText" ? sanitizeRichText(el.innerHTML) : (el.textContent ?? "");

  /**
   * Positioniert die Format-Toolbar über dem fokussierten richText-Feld
   * (an der Selektion, sonst am Feld-Anfang) und liest den aktiven Format-Status.
   * Für Plain-Text/kein Fokus: Toolbar aus.
   */
  const refreshToolbar = () => {
    const focused = focusedRef.current;
    if (!focused) {
      setToolbar(null);
      setFmt(null);
      return;
    }
    const type = blockTypeOf(focused.blockId);
    const kind = type ? fieldKindOf(type, focused.fieldKey) : undefined;
    if (kind !== "richText") {
      setToolbar(null);
      setFmt(null);
      return;
    }
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    // Aktuelle Selektion/Caret merken (auch collapsed – für „aktivieren & schreiben").
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    let rect: DOMRect | null = null;
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      rect = sel.getRangeAt(0).getBoundingClientRect();
    } else {
      const el = containerRef.current?.querySelector<HTMLElement>(
        `[data-editkraft-block-id="${focused.blockId}"] [data-ek-field="${focused.fieldKey}"]`,
      );
      rect = el?.getBoundingClientRect() ?? null;
    }
    if (!rect) {
      setToolbar(null);
      return;
    }
    // Über der Auswahl anzeigen; ist oben kein Platz (Feld ganz oben), darunter –
    // damit die Leiste den Text nie verdeckt.
    const above = rect.top - 46;
    const top = above >= 6 ? above : rect.bottom + 8;
    const left = Math.max(6, rect.left);
    setToolbar((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
    const q = (c: string): boolean => {
      try {
        return document.queryCommandState(c);
      } catch {
        return false;
      }
    };
    let block = "";
    try {
      block = String(document.queryCommandValue("formatBlock") || "").toLowerCase();
    } catch {
      block = "";
    }
    const next = {
      bold: q("bold"),
      italic: q("italic"),
      underline: q("underline"),
      strike: q("strikeThrough"),
      ul: q("insertUnorderedList"),
      ol: q("insertOrderedList"),
      block,
    };
    setFmt((prev) =>
      prev &&
      prev.bold === next.bold &&
      prev.italic === next.italic &&
      prev.underline === next.underline &&
      prev.strike === next.strike &&
      prev.ul === next.ul &&
      prev.ol === next.ol &&
      prev.block === next.block
        ? prev
        : next,
    );
  };
  refreshRef.current = refreshToolbar;
  popoverOpenRef.current =
    linkPopover !== null || selectPopover !== null || imagePopover !== null || cropMode !== null;

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

  // Globals-Pendant zu resolveField: data-ek-global-Element + Feld-Kind.
  const resolveGlobal = (target: HTMLElement) => {
    if (!globals) return null;
    const el = target.closest<HTMLElement>("[data-ek-global]");
    if (!el) return null;
    const key = el.getAttribute("data-ek-global") ?? "";
    const kind = globalKindOf(key);
    if (kind !== "text" && kind !== "richText") return null;
    return { el, key, kind };
  };

  const sendGlobalUpdateDebounced = (key: string, value: string) => {
    if (globalDebounceRef.current) clearTimeout(globalDebounceRef.current);
    globalDebounceRef.current = setTimeout(() => {
      postToStudio(createMessage("ek:global-update", { values: { [key]: value } }), studioOrigin);
    }, 300);
  };

  const onInput = (e: { target: EventTarget | null }) => {
    const f = resolveField(e.target as HTMLElement);
    if (f) {
      sendUpdateDebounced(f.blockId, f.fieldKey, currentValueFromDom(f.el, f.kind));
      return;
    }
    const g = resolveGlobal(e.target as HTMLElement);
    if (!g) return;
    sendGlobalUpdateDebounced(g.key, currentValueFromDom(g.el, g.kind));
  };

  const onFocusIn = (e: { target: EventTarget | null }) => {
    const f = resolveField(e.target as HTMLElement);
    if (f) {
      focusedRef.current = { blockId: f.blockId, fieldKey: f.fieldKey };
      postToStudio(createMessage("ek:focus-field", { blockId: f.blockId, fieldKey: f.fieldKey }), studioOrigin);
      // Beim Klick in ein richText-Feld sofort die Format-Toolbar zeigen.
      refreshToolbar();
      return;
    }
    const g = resolveGlobal(e.target as HTMLElement);
    if (g) focusedGlobalRef.current = g.key;
  };

  const onFocusOut = (e: { target: EventTarget | null }) => {
    const f = resolveField(e.target as HTMLElement);
    focusedRef.current = null;
    setToolbar(null);
    setFmt(null);
    if (!f) {
      // Globals-Feld verlassen: finalen Wert in den State übernehmen (React
      // aktualisiert damit alle Canvas-Vorkommen) + Site-Chrome imperativ.
      const g = resolveGlobal(e.target as HTMLElement);
      focusedGlobalRef.current = null;
      if (!g || popoverOpenRef.current) return;
      const value = currentValueFromDom(g.el, g.kind);
      setGlobalValues((current) => ({ ...current, [g.key]: value }));
      applyGlobalsToChrome({ [g.key]: value });
      sendGlobalUpdateDebounced(g.key, value);
      return;
    }
    // Popover offen (z. B. Fokus im Link-Eingabefeld): Feld NICHT in den Tree
    // schreiben – sonst re-rendert das Feld und die gespeicherte Selektion
    // (für den Inline-Link) zeigt auf ersetzte Knoten.
    if (popoverOpenRef.current) return;
    // Finalen (sanitisierten) Wert in den lokalen State übernehmen.
    const value = currentValueFromDom(f.el, f.kind);
    setTree((current) => updateBlockProps(current, f.blockId, { [f.fieldKey]: value }));
  };

  const onClickCapture = (e: {
    target: EventTarget | null;
    stopPropagation: () => void;
    preventDefault: () => void;
  }) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // (A) Klick auf einen Link: im Editor wird NIE navigiert. Der <a> öffnet die
    // Bearbeitung (Label + URL) bzw. selektiert nur den Block – Seitenwechsel läuft
    // über den Page-Switcher des Studios, nicht über Canvas-Links. preventDefault/
    // stopPropagation daher bedingungslos, sobald ein <a> getroffen ist (auch bei
    // Klick auf ein Icon/<span> INNERHALB des <a> – closest("a") greift bereits).
    const anchor = target.closest?.("a") as HTMLAnchorElement | null;
    if (anchor) {
      e.preventDefault();
      e.stopPropagation();
      const fieldEl = anchor.closest?.<HTMLElement>("[data-ek-field]");
      const fieldKey = fieldEl?.getAttribute("data-ek-field") ?? null;
      // Block über den <a> auflösen (nicht nur über fieldEl), damit die Block-
      // Selektion auch für Links ganz ohne editierbares Feld greift.
      const wrapper = anchor.closest<HTMLElement>("[data-editkraft-block-id]");
      const blockId = wrapper?.getAttribute("data-editkraft-block-id") ?? null;
      const type = blockId ? blockTypeOf(blockId) : undefined;
      const kind = type && fieldKey ? fieldKindOf(type, fieldKey) : undefined;
      // richText-Feld hat Vorrang: ein <a> darin ist ein Inline-Link (Label kommt
      // aus dem Rich-Text-Inhalt), kein CTA → Inline-Popover.
      if (blockId && fieldKey && kind === "richText") {
        openInlinePopover(blockId, fieldKey, anchor);
        return;
      }
      // ekLink-Feld (CTA/Button): Label + URL bearbeiten – unabhängig davon, ob
      // data-ek-field auf dem <a> selbst oder auf einem Wrapper darum sitzt.
      if (blockId && fieldKey && kind === "link") {
        openCtaPopover(blockId, fieldKey, anchor);
        return;
      }
      // Kein editierbares Link-Ziel: den getroffenen Block nur selektieren (wie der
      // Bild-/Block-Pfad unten); navigiert wird dank preventDefault trotzdem nie.
      if (blockId) {
        setSelectedId(blockId);
        postToStudio(createMessage("ek:select", { blockId }), studioOrigin);
      }
      return;
    }

    // (B) Klick auf ein Bild-Feld (bestehend): Auswahl selbst setzen + Event stoppen.
    const el = target.closest?.<HTMLElement>("[data-ek-field]");
    if (!el) return;
    const wrapper = el.closest<HTMLElement>("[data-editkraft-block-id]");
    const blockId = wrapper?.getAttribute("data-editkraft-block-id") ?? null;
    const fieldKey = el.getAttribute("data-ek-field") ?? null;
    if (!blockId || !fieldKey) return;
    const type = blockTypeOf(blockId);
    const kind = type ? fieldKindOf(type, fieldKey) : undefined;
    if (kind === "image") {
      e.stopPropagation();
      setSelectedId(blockId);
      postToStudio(createMessage("ek:select", { blockId }), studioOrigin);
      postToStudio(createMessage("ek:focus-field", { blockId, fieldKey }), studioOrigin);
      const imgEl = (el.querySelector?.<HTMLElement>("img") as HTMLElement | null) ?? el;
      openImagePopover(blockId, fieldKey, imgEl);
      return;
    }

    // (C) Klick auf ein select-Feld: Options-Popover öffnen (kein contenteditable –
    // Enum-Werte werden ausschließlich über das Popover geändert).
    if (kind === "select") {
      e.stopPropagation();
      setSelectedId(blockId);
      postToStudio(createMessage("ek:select", { blockId }), studioOrigin);
      postToStudio(createMessage("ek:focus-field", { blockId, fieldKey }), studioOrigin);
      openSelectPopover(blockId, fieldKey, el);
    }
  };

  // Stabil, damit der memoizte Block-Baum nicht bei jedem Render neu entsteht.
  const onSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      postToStudio(createMessage("ek:select", { blockId: id }), studioOrigin);
    },
    [studioOrigin],
  );

  // Block-Baum NUR von `tree`/`globalValues` (und stabilen Deps) abhängig
  // memoizen. So lösen Toolbar-/Format-/Auswahl-State-Änderungen KEIN Re-Render
  // der editierbaren Felder aus – der contentEditable-DOM bleibt stabil,
  // Selektion/Cursor überleben. globalValues ändert sich nur beim VERLASSEN
  // eines Globals-Felds (oder durch Studio-Updates auf nicht-fokussierte Keys),
  // nie während des Tippens — der Cursor ist also auch hier sicher.
  const blocksEl = useMemo(
    () =>
      createElement(PreviewBlocks, {
        blocks: tree.blocks,
        registry,
        onSelect,
        globals: globals ? globalValues : undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree.blocks, registry, onSelect, globalValues],
  );

  // Auswahl-Outline imperativ setzen (ohne Re-Render der Blöcke).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-editkraft-block-id]"))) {
      const on = el.getAttribute("data-editkraft-block-id") === selectedId;
      el.style.outline = on ? "2px solid #F5A623" : "";
      el.style.outlineOffset = on ? "2px" : "";
      // Weiterhin als Attribut spiegeln (stabiler Hook für Tests/Tooling), aber
      // imperativ statt über React-Props gesetzt – siehe Kommentar in PreviewBlocks:
      // ein prop-getriebenes Attribut würde bei jeder Auswahländerung den ganzen
      // Block (inkl. contentEditable-Feld) neu rendern und Cursor/Selektion zerstören.
      if (on) {
        el.setAttribute("data-editkraft-selected", "true");
      } else {
        el.removeAttribute("data-editkraft-selected");
      }
    }
  }, [selectedId, tree.blocks]);

  const restoreSelection = () => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    return sel;
  };

  // Liegt die aktuelle Selektion (noch) im gegebenen Feld?
  const selectionInside = (el: HTMLElement): boolean => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    return !!(sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer));
  };

  const applyFormat = (command: string) => {
    const focused = focusedRef.current;
    if (!focused) return;
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-editkraft-block-id="${focused.blockId}"] [data-ek-field="${focused.fieldKey}"]`,
    );
    if (!el) return;

    // WICHTIG: Selektion NUR wiederherstellen, wenn sie das Feld verlassen hat.
    // Im Normalfall hält der Button-mousedown (preventDefault) den echten Cursor –
    // den dürfen wir nicht mit einer alten Range überschreiben (sonst springt er nach vorn).
    if (!selectionInside(el)) {
      el.focus();
      restoreSelection();
    }

    // Tag-basierte Auszeichnung erzwingen (<b>/<i>/<u>/<strike>) statt inline-styles –
    // sonst verwirft der Sanitizer die (nicht erlaubten) <span style>-Wrapper.
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      /* ältere Engines ohne styleWithCSS: ignorieren */
    }

    if (command === "link") {
      // Inline-Link: Popover öffnen (mit ODER ohne Auswahl). Erzeugt wird der <a>
      // erst beim Übernehmen – Abbrechen lässt den Text unangetastet. Mit Auswahl
      // wird sie umschlossen, ohne Auswahl wird ein Link mit dem eingegebenen Text
      // an der Cursor-Position eingefügt.
      const sel = typeof window !== "undefined" ? window.getSelection() : null;
      const hasRange = !!(sel && sel.rangeCount > 0);
      if (hasRange) savedRangeRef.current = sel!.getRangeAt(0).cloneRange();
      const rect = hasRange ? sel!.getRangeAt(0).getBoundingClientRect() : el.getBoundingClientRect();
      linkElRef.current = null;
      setLinkPopover({
        mode: "inline",
        blockId: focused.blockId,
        fieldKey: focused.fieldKey,
        top: rect.bottom + 8,
        left: Math.max(6, rect.left),
        type: "url",
        value: "",
        label: sel && !sel.isCollapsed ? sel.toString() : "",
      });
      return;
    }

    if (command === "p" || command === "h2" || command === "h3" || command === "blockquote") {
      document.execCommand("formatBlock", false, `<${command}>`);
    } else {
      // bold | italic | underline | strikethrough | insertUnorderedList | insertOrderedList
      document.execCommand(command);
    }

    sendUpdateDebounced(focused.blockId, focused.fieldKey, sanitizeRichText(el.innerHTML));
    refreshToolbar();
  };

  // --- Link-Popover (Buttons/cta + Inline-<a>) ------------------------------
  const parseHref = (href: string): { type: "url" | "mail" | "tel"; value: string } => {
    if (href.startsWith("mailto:")) return { type: "mail", value: href.slice(7) };
    if (href.startsWith("tel:")) return { type: "tel", value: href.slice(4) };
    return { type: "url", value: href };
  };

  const buildHref = (type: "url" | "mail" | "tel", value: string): string => {
    const v = value.trim();
    if (!v) return "";
    if (type === "mail") return `mailto:${v}`;
    if (type === "tel") return `tel:${v.replace(/\s+/g, "")}`;
    if (/^(https?:\/\/|\/)/i.test(v)) return v; // vollständige URL oder interne /slug
    return `https://${v}`;
  };

  const findBlockById = (id: string): Block | undefined => {
    const walk = (blocks: Block[]): Block | undefined => {
      for (const b of blocks) {
        if (b.id === id) return b;
        if (b.children) {
          const c = walk(b.children);
          if (c) return c;
        }
      }
      return undefined;
    };
    return walk(tree.blocks);
  };

  const openCtaPopover = (blockId: string, fieldKey: string, anchor: HTMLElement) => {
    const val = findBlockById(blockId)?.props?.[fieldKey] as { href?: string; label?: string } | undefined;
    const p = parseHref(val?.href ?? "");
    const rect = anchor.getBoundingClientRect();
    linkElRef.current = null;
    setLinkPopover({
      mode: "cta",
      blockId,
      fieldKey,
      top: rect.bottom + 8,
      left: Math.max(6, rect.left),
      type: p.type,
      value: p.value,
      label: val?.label ?? anchor.textContent ?? "",
    });
  };

  const openInlinePopover = (blockId: string, fieldKey: string, anchor: HTMLAnchorElement) => {
    const p = parseHref(anchor.getAttribute("href") ?? "");
    const rect = anchor.getBoundingClientRect();
    linkElRef.current = anchor;
    setLinkPopover({
      mode: "inline",
      blockId,
      fieldKey,
      top: rect.bottom + 8,
      left: Math.max(6, rect.left),
      type: p.type,
      value: p.value,
      label: anchor.textContent ?? "",
    });
  };

  const closeLinkPopover = () => {
    setLinkPopover(null);
    linkElRef.current = null;
  };

  const pushFieldUpdate = (blockId: string, fieldKey: string) => {
    const fieldEl = containerRef.current?.querySelector<HTMLElement>(
      `[data-editkraft-block-id="${blockId}"] [data-ek-field="${fieldKey}"]`,
    );
    if (fieldEl) sendUpdateDebounced(blockId, fieldKey, sanitizeRichText(fieldEl.innerHTML));
  };

  const saveLink = () => {
    const lp = linkPopover;
    if (!lp) return;
    const href = buildHref(lp.type, lp.value);
    if (lp.mode === "cta") {
      const props = { [lp.fieldKey]: { href, label: lp.label } };
      setTree((cur) => updateBlockProps(cur, lp.blockId, props));
      postToStudio(createMessage("ek:update", { blockId: lp.blockId, props }), studioOrigin);
    } else {
      const a = linkElRef.current;
      const fieldEl = containerRef.current?.querySelector<HTMLElement>(
        `[data-editkraft-block-id="${lp.blockId}"] [data-ek-field="${lp.fieldKey}"]`,
      );
      if (a) {
        // bestehenden Inline-Link bearbeiten
        if (!href) {
          a.replaceWith(...Array.from(a.childNodes)); // leerer href → Link auflösen
        } else {
          a.setAttribute("href", href);
          if (lp.label && lp.label !== a.textContent) a.textContent = lp.label;
        }
      } else if (href && fieldEl) {
        // Neuen Link erzeugen. Die Range VOR fieldEl.focus() lokal sichern – focus()
        // löst onFocusIn→refreshToolbar aus, das savedRangeRef sonst überschreibt.
        const savedRange = savedRangeRef.current;
        fieldEl.focus();
        const sel = typeof window !== "undefined" ? window.getSelection() : null;
        if (sel && savedRange) {
          sel.removeAllRanges();
          sel.addRange(savedRange);
        }
        try {
          document.execCommand("styleWithCSS", false, "false");
        } catch {
          /* ignore */
        }
        if (savedRange && !savedRange.collapsed) {
          // markierten Text umschließen
          document.execCommand("createLink", false, href);
          if (lp.label) {
            const node = sel?.anchorNode ?? null;
            const el2 = node && (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement);
            const newA = el2?.closest?.("a");
            if (newA && newA.textContent !== lp.label) newA.textContent = lp.label;
          }
        } else {
          // ohne Auswahl: Link mit Text an der Cursor-Position einfügen
          const esc = (s: string) =>
            s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
          document.execCommand("insertHTML", false, `<a href="${esc(href)}">${esc(lp.label || href)}</a>`);
        }
      }
      if (fieldEl) pushFieldUpdate(lp.blockId, lp.fieldKey);
    }
    closeLinkPopover();
  };

  const removeInlineLink = () => {
    const lp = linkPopover;
    const a = linkElRef.current;
    if (lp && lp.mode === "inline" && a) {
      a.replaceWith(...Array.from(a.childNodes));
      pushFieldUpdate(lp.blockId, lp.fieldKey);
    }
    closeLinkPopover();
  };

  // --- Select-Popover (Enum-Felder: Options-Liste statt contenteditable) ----
  const openSelectPopover = (blockId: string, fieldKey: string, el: HTMLElement) => {
    const type = blockTypeOf(blockId);
    const field = type
      ? registry.get(type)?.definition.fields.find((f) => f.key === fieldKey)
      : undefined;
    if (!field || field.kind !== "select" || field.options.length === 0) return;
    const current = String(findBlockById(blockId)?.props?.[fieldKey] ?? "");
    const rect = el.getBoundingClientRect();
    setSelectPopover({
      blockId,
      fieldKey,
      top: rect.bottom + 8,
      left: Math.max(6, rect.left),
      options: field.options,
      current,
    });
  };

  const closeSelectPopover = () => setSelectPopover(null);

  // Option übernehmen: lokal setzen + SOFORT (ohne Debounce) an das Studio melden –
  // gleiches Muster wie saveLink für cta-Felder.
  const applySelectOption = (value: string) => {
    const sp = selectPopover;
    if (!sp) return;
    const props = { [sp.fieldKey]: value };
    setTree((cur) => updateBlockProps(cur, sp.blockId, props));
    postToStudio(createMessage("ek:update", { blockId: sp.blockId, props }), studioOrigin);
    closeSelectPopover();
  };

  // --- Bild-Popover (URL / Datei-Upload / Drag&Drop) ------------------------
  const openImagePopover = (blockId: string, fieldKey: string, imgEl: HTMLElement) => {
    const val = findBlockById(blockId)?.props?.[fieldKey] as
      | { url?: string; alt?: string; kind?: "image" | "video"; poster?: string; controls?: boolean }
      | undefined;
    const rect = imgEl.getBoundingClientRect();
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    setImagePopover({
      blockId,
      fieldKey,
      top: Math.max(6, Math.min(rect.top + 8, vh - 290)),
      left: Math.max(6, rect.left + 8),
      url: val?.url ?? "",
      alt: val?.alt ?? "",
      kind: val?.kind === "video" ? "video" : "image",
      poster: val?.poster ?? "",
      controls: val?.controls === true,
      status: "idle",
    });
  };

  const closeImagePopover = () => setImagePopover(null);

  const mergeImageValue = (blockId: string, fieldKey: string, patch: Record<string, unknown>) => {
    const cur = (findBlockById(blockId)?.props?.[fieldKey] ?? {}) as Record<string, unknown>;
    const next = { ...cur, ...patch };
    setTree((c) => updateBlockProps(c, blockId, { [fieldKey]: next }));
    postToStudio(createMessage("ek:update", { blockId, props: { [fieldKey]: next } }), studioOrigin);
  };

  const applyImageUrl = () => {
    const ip = imagePopover;
    if (!ip) return;
    const url = ip.url.trim();
    if (url) mergeImageValue(ip.blockId, ip.fieldKey, { url, assetId: "" });
    closeImagePopover();
  };

  const handleImageFile = (file: File) => {
    const ip = imagePopover;
    if (!ip || !file) return;
    setImagePopover({ ...ip, status: "uploading" });
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : "";
      // Rohes postMessage (kein Schema-Typ): Datei serverseitig im Studio hochladen.
      // Das Studio antwortet mit ek:update {assetId, url} → Bild aktualisiert sich.
      if (typeof window !== "undefined") {
        window.parent.postMessage(
          {
            channel: "editkraft",
            v: 1,
            type: "ek:asset-upload",
            blockId: ip.blockId,
            fieldKey: ip.fieldKey,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            dataBase64: base64,
          },
          studioOrigin,
        );
      }
      closeImagePopover();
    };
    reader.readAsDataURL(file);
  };

  // KI-Bild-Editor im Studio öffnen (Raw-Nachricht wie ek:asset-upload – der
  // Gemini-Key und der Asset-Upload leben serverseitig im Studio, nie hier).
  const openAiEditor = (blockId: string, fieldKey: string) => {
    const val = findBlockById(blockId)?.props?.[fieldKey] as { url?: string } | undefined;
    if (typeof window !== "undefined") {
      window.parent.postMessage(
        { channel: "editkraft", v: 1, type: "ek:ai-edit-open", blockId, fieldKey, url: val?.url ?? "" },
        studioOrigin,
      );
    }
    closeImagePopover();
  };

  // Asset-Library im Studio öffnen (Raw-Nachricht wie ek:ai-edit-open – die
  // Library selbst (Speicher, Auswahl) lebt serverseitig im Studio, nie hier).
  const openLibrary = (blockId: string, fieldKey: string) => {
    if (typeof window !== "undefined") {
      window.parent.postMessage(
        { channel: "editkraft", v: 1, type: "ek:library-open", blockId, fieldKey },
        studioOrigin,
      );
    }
    closeImagePopover();
  };

  // --- Medium (Bild ⇄ Video) ------------------------------------------------
  // Videos bis 25 MB (mp4/webm); clientseitig geprüft, damit große Dateien gar
  // nicht erst als Base64 ans Studio wandern.
  const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

  // Medium umschalten. Der Registry-Feldtyp bleibt "image" – nur der WERT trägt
  // `kind`. Nicht destruktiv: bei Video→Bild bleiben poster/controls im Wert
  // liegen (der Renderer/EkMedia ignoriert sie bei kind:"image"), sodass ein
  // versehentlicher Wechsel die Video-Konfiguration nicht löscht.
  const setMediaKind = (kind: "image" | "video") => {
    const ip = imagePopover;
    if (!ip || ip.kind === kind) return;
    setImagePopover({ ...ip, kind, status: "idle", errorMsg: undefined });
    mergeImageValue(ip.blockId, ip.fieldKey, { kind });
  };

  const applyVideoUrl = () => {
    const ip = imagePopover;
    if (!ip) return;
    const url = ip.url.trim();
    if (url) mergeImageValue(ip.blockId, ip.fieldKey, { url, assetId: "", kind: "video" });
    closeImagePopover();
  };

  const handleVideoFile = (file: File) => {
    const ip = imagePopover;
    if (!ip || !file) return;
    if (file.size > MAX_VIDEO_BYTES) {
      // Zu groß: sprechende Meldung, KEIN postMessage.
      setImagePopover({ ...ip, status: "error", errorMsg: "Video is too large (max. 25 MB)." });
      return;
    }
    setImagePopover({ ...ip, status: "uploading", errorMsg: undefined });
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : "";
      // Gleicher ek:asset-upload-Weg wie bei Bildern; die mimeType video/… sagt
      // dem Studio-Backend, dass ein Video hochzuladen ist. Der Wert trägt bereits
      // kind:"video" (durch den Tab-Wechsel), das Studio antwortet mit ek:update.
      if (typeof window !== "undefined") {
        window.parent.postMessage(
          {
            channel: "editkraft",
            v: 1,
            type: "ek:asset-upload",
            blockId: ip.blockId,
            fieldKey: ip.fieldKey,
            fileName: file.name,
            mimeType: file.type || "video/mp4",
            dataBase64: base64,
          },
          studioOrigin,
        );
      }
      closeImagePopover();
    };
    reader.readAsDataURL(file);
  };

  // --- Zuschneiden (1:1-Framing) --------------------------------------------
  const clampPct = (n: number) => Math.max(0, Math.min(100, n));

  const findImgEl = (blockId: string, fieldKey: string): HTMLImageElement | null =>
    (containerRef.current?.querySelector(
      `[data-editkraft-block-id="${blockId}"] [data-ek-field="${fieldKey}"] img`,
    ) as HTMLImageElement | null) ?? null;

  // Rahmen live auf das echte Kunden-<img> anwenden (identische Styles wie im Renderer).
  const applyFrameToImg = (img: HTMLImageElement, frame: EkImageFrame) => {
    Object.assign(img.style, imageFrameStyles(frame).image);
  };

  const openCrop = (blockId: string, fieldKey: string) => {
    const img = findImgEl(blockId, fieldKey);
    if (!img) return;
    const val = findBlockById(blockId)?.props?.[fieldKey] as { frame?: EkImageFrame } | undefined;
    const frame: EkImageFrame = val?.frame ? { ...val.frame } : { ...DEFAULT_IMAGE_FRAME };
    const rect = img.getBoundingClientRect();
    cropImgRef.current = img;
    closeImagePopover();
    setCropMode({
      blockId,
      fieldKey,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      frame,
    });
  };

  const updateCropFrame = (next: EkImageFrame) => {
    setCropMode((c) => (c ? { ...c, frame: next } : c));
    if (cropImgRef.current) applyFrameToImg(cropImgRef.current, next);
  };

  const commitCrop = () => {
    setCropMode((c) => {
      if (c) mergeImageValue(c.blockId, c.fieldKey, { frame: c.frame });
      return null;
    });
    cropImgRef.current = null;
    cropDragRef.current = null;
  };

  const cancelCrop = () => {
    setCropMode((c) => {
      if (c && cropImgRef.current) {
        const val = findBlockById(c.blockId)?.props?.[c.fieldKey] as { frame?: EkImageFrame } | undefined;
        applyFrameToImg(cropImgRef.current, val?.frame ?? DEFAULT_IMAGE_FRAME);
      }
      return null;
    });
    cropImgRef.current = null;
    cropDragRef.current = null;
  };

  // Bild-Popover per Außenklick verlassen: ausstehende URL/Alt übernehmen (der
  // Nutzer erwartet, dass sein Eingabewert bleibt), dann schließen. Ein reiner
  // Blur-Commit des Alt-Felds greift hier nicht, weil der pointerdown-Handler in
  // der Capture-Phase VOR dem Feld-Blur läuft.
  const commitImagePopoverOnDismiss = () => {
    const ip = imagePopover;
    if (!ip) return;
    const cur = (findBlockById(ip.blockId)?.props?.[ip.fieldKey] ?? {}) as {
      url?: string;
      alt?: string;
      poster?: string;
    };
    const patch: Record<string, unknown> = {};
    const url = ip.url.trim();
    if (url && url !== (cur.url ?? "")) {
      patch.url = url;
      patch.assetId = "";
    }
    if ((cur.alt ?? "") !== ip.alt) patch.alt = ip.alt;
    // Poster-URL nur im Video-Tab (der pointerdown-Handler läuft vor dem Blur).
    if (ip.kind === "video" && (cur.poster ?? "") !== ip.poster) patch.poster = ip.poster;
    if (Object.keys(patch).length) mergeImageValue(ip.blockId, ip.fieldKey, patch);
    closeImagePopover();
  };

  // Offenes Bearbeiten-Popover schließt bei Klick daneben und bei Escape.
  // Innen-Klicks (Felder/Buttons/Tab-Leiste, auch die Toolbar) lassen es offen.
  // Außenklick ÜBERNIMMT den Wert (wie das Verlassen einer Tabellenzelle),
  // Escape verwirft ihn; der modale Crop-Modus bricht bei Außenklick ab, damit
  // ein Streifklick nicht ungewollt einen Rahmen festschreibt.
  useEffect(() => {
    if (!linkPopover && !selectPopover && !imagePopover && !cropMode) return;
    const INSIDE =
      "[data-editkraft-link-popover],[data-editkraft-select-popover]," +
      "[data-editkraft-image-popover],[data-editkraft-crop-surface]," +
      "[data-editkraft-crop-controls],[data-editkraft-toolbar]";
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(INSIDE)) return;
      if (cropMode) cancelCrop();
      else if (linkPopover) saveLink();
      else if (imagePopover) commitImagePopoverOnDismiss();
      else if (selectPopover) closeSelectPopover();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (cropMode) cancelCrop();
      else if (linkPopover) closeLinkPopover();
      else if (imagePopover) closeImagePopover();
      else if (selectPopover) closeSelectPopover();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
    // Absicht: nur bei Popover-Wechsel neu abonnieren; die Commit-/Close-Funktionen
    // schließen über genau diese States.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkPopover, selectPopover, imagePopover, cropMode]);

  // Toolbar-Bausteine (createElement, Inline-Styles – die Preview ist die Kundenseite).
  const linkIcon: ReactNode = createElement(
    "svg",
    {
      width: 15,
      height: 15,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    createElement("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }),
    createElement("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }),
  );

  const cropIcon: ReactNode = createElement(
    "svg",
    {
      width: 15,
      height: 15,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    createElement("path", { d: "M6 2v14a2 2 0 0 0 2 2h14" }),
    createElement("path", { d: "M18 22V8a2 2 0 0 0-2-2H2" }),
  );

  const sparkleIcon: ReactNode = createElement(
    "svg",
    {
      width: 15,
      height: 15,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    createElement("path", {
      d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z",
    }),
    createElement("path", { d: "M20 3v4" }),
    createElement("path", { d: "M22 5h-4" }),
  );

  const libraryIcon: ReactNode = createElement(
    "svg",
    {
      width: 15,
      height: 15,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    createElement("path", { d: "m16 6 4 14" }),
    createElement("path", { d: "M12 6v14" }),
    createElement("path", { d: "M8 8v12" }),
    createElement("path", { d: "M4 4v16" }),
  );

  // Kompakter Aktions-Button für das Bild-Popover (Zuschneiden / KI-Editor).
  const imgActionButton = (icon: ReactNode, label: string, onClick: () => void, accent = false): ReactNode =>
    createElement(
      "button",
      {
        type: "button",
        onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
        onClick,
        style: {
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          padding: "8px 0",
          borderRadius: 8,
          border: accent ? "1px solid rgba(245,166,35,0.35)" : "1px solid #2E3138",
          background: accent ? "rgba(245,166,35,0.10)" : "#0C0D0F",
          color: accent ? "#FFB020" : "#EDEEF0",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        },
      },
      icon,
      label,
    );

  const fmtButton = (opts: {
    label: ReactNode;
    title: string;
    active: boolean;
    onClick: () => void;
    style?: Record<string, unknown>;
  }): ReactNode =>
    createElement(
      "button",
      {
        type: "button",
        title: opts.title,
        // Mousedown darf die Selektion im contentEditable nicht verlieren.
        onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
        onClick: opts.onClick,
        style: {
          minWidth: 28,
          height: 28,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 7px",
          fontSize: 13,
          lineHeight: 1,
          border: "none",
          borderRadius: 7,
          cursor: "pointer",
          background: opts.active ? "rgba(245,166,35,0.16)" : "transparent",
          color: opts.active ? "#FFB020" : "#A5A8B0",
          transition: "background 120ms, color 120ms",
          ...opts.style,
        },
      },
      opts.label,
    );

  const divider = (): ReactNode =>
    createElement("div", { style: { width: 1, height: 18, background: "#2E3138", margin: "0 3px" } });

  const isParagraph = !fmt?.block || fmt.block === "p" || fmt.block === "div";

  const renderLinkPopover = (): ReactNode => {
    const lp = linkPopover;
    if (!lp) return null;
    const inputStyle = {
      width: "100%",
      boxSizing: "border-box" as const,
      background: "#0C0D0F",
      border: "1px solid #2E3138",
      borderRadius: 7,
      color: "#EDEEF0",
      padding: "7px 9px",
      fontSize: 13,
      outline: "none",
    };
    const typeBtn = (t: "url" | "mail" | "tel", lbl: string): ReactNode =>
      createElement(
        "button",
        {
          type: "button",
          key: t,
          onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
          onClick: () => setLinkPopover({ ...lp, type: t }),
          style: {
            flex: 1,
            padding: "5px 0",
            fontSize: 12,
            borderRadius: 6,
            cursor: "pointer",
            border: `1px solid ${lp.type === t ? "transparent" : "#2E3138"}`,
            background: lp.type === t ? "#F5A623" : "transparent",
            color: lp.type === t ? "#1A1400" : "#A5A8B0",
          },
        },
        lbl,
      );
    const placeholders: Record<string, string> = {
      url: "https://… or /page",
      mail: "name@domain.com",
      tel: "+1 …",
    };
    const children: ReactNode[] = [
      createElement(
        "div",
        { key: "types", style: { display: "flex", gap: 4 } },
        typeBtn("url", "URL"),
        typeBtn("mail", "Email"),
        typeBtn("tel", "Phone"),
      ),
      createElement("input", {
        key: "value",
        value: lp.value,
        placeholder: placeholders[lp.type],
        onChange: (e: { target: { value: string } }) => setLinkPopover({ ...lp, value: e.target.value }),
        style: inputStyle,
      }),
    ];
    children.push(
      createElement("input", {
        key: "label",
        value: lp.label,
        placeholder: lp.mode === "cta" ? "Button text" : "Link text (optional)",
        onChange: (e: { target: { value: string } }) => setLinkPopover({ ...lp, label: e.target.value }),
        style: inputStyle,
      }),
    );
    if (lp.type === "url" && pages.length > 0) {
      children.push(
        createElement(
          "div",
          { key: "pages", style: { display: "flex", flexDirection: "column" as const, gap: 2, maxHeight: 130, overflowY: "auto" as const } },
          createElement(
            "div",
            { key: "ph", style: { fontSize: 11, color: "#6E7178", textTransform: "uppercase" as const, letterSpacing: 0.4 } },
            "Internal page",
          ),
          ...pages.map((pg) =>
            createElement(
              "button",
              {
                type: "button",
                key: pg.slug,
                onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
                onClick: () => setLinkPopover({ ...lp, type: "url", value: `/${pg.slug}` }),
                style: {
                  textAlign: "left" as const,
                  padding: "5px 8px",
                  borderRadius: 6,
                  border: "none",
                  background: lp.value === `/${pg.slug}` ? "rgba(245,166,35,0.16)" : "transparent",
                  color: "#A5A8B0",
                  cursor: "pointer",
                  fontSize: 12,
                },
              },
              pg.title || `/${pg.slug}`,
            ),
          ),
        ),
      );
    }
    const actions: ReactNode[] = [
      createElement(
        "button",
        {
          key: "save",
          type: "button",
          onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
          onClick: saveLink,
          style: {
            flex: 1,
            padding: "7px 0",
            borderRadius: 7,
            border: "none",
            background: "#F5A623",
            color: "#1A1400",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 13,
          },
        },
        "Apply",
      ),
    ];
    if (lp.mode === "inline") {
      actions.push(
        createElement(
          "button",
          {
            key: "rm",
            type: "button",
            onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
            onClick: removeInlineLink,
            style: {
              padding: "7px 10px",
              borderRadius: 7,
              border: "1px solid #2E3138",
              background: "transparent",
              color: "#F98186",
              cursor: "pointer",
              fontSize: 13,
            },
          },
          "Remove",
        ),
      );
    }
    actions.push(
      createElement(
        "button",
        {
          key: "cancel",
          type: "button",
          onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
          onClick: closeLinkPopover,
          style: {
            padding: "7px 10px",
            borderRadius: 7,
            border: "1px solid #2E3138",
            background: "transparent",
            color: "#A5A8B0",
            cursor: "pointer",
            fontSize: 13,
          },
        },
        "Cancel",
      ),
    );
    children.push(createElement("div", { key: "actions", style: { display: "flex", gap: 6 } }, ...actions));

    return createElement(
      "div",
      {
        "data-editkraft-link-popover": "true",
        style: {
          position: "fixed",
          top: lp.top,
          left: lp.left,
          zIndex: 2147483647,
          width: 280,
          display: "flex",
          flexDirection: "column" as const,
          gap: 8,
          padding: 10,
          background: "#1A1C1F",
          border: "1px solid #2E3138",
          borderRadius: 12,
          boxShadow: "0 12px 34px -8px rgba(0,0,0,0.6)",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        },
      },
      ...children,
    );
  };

  const renderSelectPopover = (): ReactNode => {
    const sp = selectPopover;
    if (!sp) return null;
    return createElement(
      "div",
      {
        "data-editkraft-select-popover": "true",
        style: {
          position: "fixed",
          top: sp.top,
          left: sp.left,
          zIndex: 2147483647,
          width: 220,
          display: "flex",
          flexDirection: "column" as const,
          gap: 8,
          padding: 10,
          background: "#1A1C1F",
          border: "1px solid #2E3138",
          borderRadius: 12,
          boxShadow: "0 12px 34px -8px rgba(0,0,0,0.6)",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        },
      },
      createElement(
        "div",
        {
          key: "options",
          style: { display: "flex", flexDirection: "column" as const, gap: 2, maxHeight: 220, overflowY: "auto" as const },
        },
        ...sp.options.map((opt) =>
          createElement(
            "button",
            {
              type: "button",
              key: opt.value,
              onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
              onClick: () => applySelectOption(opt.value),
              style: {
                textAlign: "left" as const,
                padding: "6px 9px",
                borderRadius: 6,
                border: "none",
                background: sp.current === opt.value ? "rgba(245,166,35,0.16)" : "transparent",
                color: sp.current === opt.value ? "#FFB020" : "#A5A8B0",
                cursor: "pointer",
                fontSize: 13,
              },
            },
            opt.label ?? opt.value,
          ),
        ),
      ),
      createElement(
        "button",
        {
          key: "cancel",
          type: "button",
          onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
          onClick: closeSelectPopover,
          style: {
            padding: "7px 10px",
            borderRadius: 7,
            border: "1px solid #2E3138",
            background: "transparent",
            color: "#A5A8B0",
            cursor: "pointer",
            fontSize: 13,
          },
        },
        "Cancel",
      ),
    );
  };

  const renderImagePopover = (): ReactNode => {
    const ip = imagePopover;
    if (!ip) return null;
    const isVideo = ip.kind === "video";
    const inputStyle = {
      boxSizing: "border-box" as const,
      width: "100%",
      background: "#0C0D0F",
      border: "1px solid #2E3138",
      borderRadius: 7,
      color: "#EDEEF0",
      padding: "7px 9px",
      fontSize: 13,
      outline: "none",
    };

    // Umschalter Bild | Video – Stil wie die url/mail/tel-Tabs des Link-Popovers.
    const mediaTab = (k: "image" | "video", lbl: string): ReactNode =>
      createElement(
        "button",
        {
          type: "button",
          key: k,
          onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
          onClick: () => setMediaKind(k),
          style: {
            flex: 1,
            padding: "5px 0",
            fontSize: 12,
            borderRadius: 6,
            cursor: "pointer",
            border: `1px solid ${ip.kind === k ? "transparent" : "#2E3138"}`,
            background: ip.kind === k ? "#F5A623" : "transparent",
            color: ip.kind === k ? "#1A1400" : "#A5A8B0",
          },
        },
        lbl,
      );

    const uploadLabel = (): ReactNode =>
      createElement(
        "label",
        {
          key: "upload",
          style: {
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            minHeight: 88,
            border: "1px dashed #3A3D45",
            borderRadius: 10,
            background: "#0C0D0F",
            color: ip.status === "error" ? "#F98186" : "#A5A8B0",
            fontSize: 12,
            cursor: "pointer",
            textAlign: "center" as const,
            padding: 12,
          },
        },
        ip.status === "uploading"
          ? "Uploading …"
          : ip.status === "error"
            ? ip.errorMsg ?? "Upload failed – try again"
            : isVideo
              ? "Drag a video here or click to upload (mp4/webm, max. 25 MB)"
              : "Drag an image here or click to upload",
        createElement("input", {
          type: "file",
          accept: isVideo ? "video/mp4,video/webm" : "image/*",
          onChange: (e: { target: { files: FileList | null } }) => {
            const f = e.target.files?.[0];
            if (f) (isVideo ? handleVideoFile : handleImageFile)(f as File);
          },
          style: { display: "none" },
        }),
      );

    // Aktions-Buttons oben: Bild bekommt Crop (nur mit URL) + Library + KI;
    // Video nur Library (kein Crop, kein KI – die Library liefert auch Videos).
    const hasUrl = !!(findBlockById(ip.blockId)?.props?.[ip.fieldKey] as { url?: string } | undefined)?.url;
    const actionRow: ReactNode = isVideo
      ? createElement(
          "div",
          { key: "actions", style: { display: "flex", gap: 6 } },
          imgActionButton(libraryIcon, "Library", () => openLibrary(ip.blockId, ip.fieldKey)),
        )
      : createElement(
          "div",
          { key: "actions", style: { display: "flex", gap: 6 } },
          hasUrl ? imgActionButton(cropIcon, "Crop", () => openCrop(ip.blockId, ip.fieldKey)) : null,
          imgActionButton(libraryIcon, "Library", () => openLibrary(ip.blockId, ip.fieldKey)),
          imgActionButton(sparkleIcon, "AI Editor", () => openAiEditor(ip.blockId, ip.fieldKey), true),
        );

    const children: ReactNode[] = [
      createElement(
        "div",
        { key: "tabs", style: { display: "flex", gap: 4 } },
        mediaTab("image", "Image"),
        mediaTab("video", "Video"),
      ),
      actionRow,
      uploadLabel(),
      createElement("input", {
        key: "url",
        value: ip.url,
        placeholder: isVideo ? "…or video URL (https://…)" : "…or image URL (https://…)",
        onChange: (e: { target: { value: string } }) => setImagePopover({ ...ip, url: e.target.value }),
        style: inputStyle,
      }),
    ];

    if (isVideo) {
      // Poster-URL (Vorschaubild) – wird beim Verlassen des Felds übernommen.
      children.push(
        createElement("input", {
          key: "poster",
          value: ip.poster,
          placeholder: "Poster image URL (optional)",
          onChange: (e: { target: { value: string } }) => setImagePopover({ ...ip, poster: e.target.value }),
          onBlur: () => {
            const cur = findBlockById(ip.blockId)?.props?.[ip.fieldKey] as { poster?: string } | undefined;
            if ((cur?.poster ?? "") !== ip.poster) mergeImageValue(ip.blockId, ip.fieldKey, { poster: ip.poster });
          },
          style: inputStyle,
        }),
      );
      // Checkbox „Show controls" – ohne = stummes Hintergrund-Video (autoplay/loop).
      children.push(
        createElement(
          "label",
          {
            key: "controls",
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "#A5A8B0",
              cursor: "pointer",
            },
          },
          createElement("input", {
            type: "checkbox",
            checked: ip.controls,
            onChange: (e: { target: { checked: boolean } }) => {
              const next = e.target.checked;
              setImagePopover({ ...ip, controls: next });
              mergeImageValue(ip.blockId, ip.fieldKey, { controls: next });
            },
          }),
          "Show controls",
        ),
      );
    } else {
      // Alt-Text (SEO/Screenreader) – wird beim Verlassen des Felds übernommen.
      children.push(
        createElement("input", {
          key: "alt",
          value: ip.alt,
          placeholder: "Alt text (image description for SEO)",
          onChange: (e: { target: { value: string } }) => setImagePopover({ ...ip, alt: e.target.value }),
          onBlur: () => {
            const cur = findBlockById(ip.blockId)?.props?.[ip.fieldKey] as { alt?: string } | undefined;
            if ((cur?.alt ?? "") !== ip.alt) mergeImageValue(ip.blockId, ip.fieldKey, { alt: ip.alt });
          },
          style: inputStyle,
        }),
      );
    }

    children.push(
      createElement(
        "div",
        { key: "apply", style: { display: "flex", gap: 6 } },
        createElement(
          "button",
          {
            type: "button",
            onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
            onClick: isVideo ? applyVideoUrl : applyImageUrl,
            style: {
              flex: 1,
              padding: "7px 0",
              borderRadius: 7,
              border: "none",
              background: "#F5A623",
              color: "#1A1400",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            },
          },
          "Apply URL",
        ),
        createElement(
          "button",
          {
            type: "button",
            onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
            onClick: closeImagePopover,
            style: {
              padding: "7px 12px",
              borderRadius: 7,
              border: "1px solid #2E3138",
              background: "transparent",
              color: "#A5A8B0",
              cursor: "pointer",
              fontSize: 13,
            },
          },
          "Cancel",
        ),
      ),
    );

    return createElement(
      "div",
      {
        "data-editkraft-image-popover": "true",
        onDragOver: (e: { preventDefault: () => void }) => e.preventDefault(),
        onDrop: (e: { preventDefault: () => void; dataTransfer: { files: FileList } | null }) => {
          e.preventDefault();
          const f = e.dataTransfer?.files?.[0];
          if (f) (isVideo ? handleVideoFile : handleImageFile)(f as File);
        },
        style: {
          position: "fixed",
          top: ip.top,
          left: ip.left,
          zIndex: 2147483647,
          width: 300,
          display: "flex",
          flexDirection: "column" as const,
          gap: 10,
          padding: 12,
          background: "#1A1C1F",
          border: "1px solid #2E3138",
          borderRadius: 12,
          boxShadow: "0 12px 34px -8px rgba(0,0,0,0.6)",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        },
      },
      ...children,
    );
  };

  const renderCropOverlay = (): ReactNode => {
    const cm = cropMode;
    if (!cm) return null;
    const { rect, frame } = cm;
    // Drag-Fläche exakt über dem Bild (Pan); Zoom per Slider oder Scrollrad.
    const surface = createElement("div", {
      "data-editkraft-crop-surface": "true",
      onPointerDown: (e: {
        clientX: number;
        clientY: number;
        pointerId: number;
        preventDefault: () => void;
        currentTarget: { setPointerCapture?: (id: number) => void };
      }) => {
        e.preventDefault();
        cropDragRef.current = { startX: e.clientX, startY: e.clientY, startFrame: frame };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      },
      onPointerMove: (e: { clientX: number; clientY: number }) => {
        const d = cropDragRef.current;
        if (!d) return;
        const size = rect.width || 1;
        // Bild folgt dem Cursor: nach rechts ziehen zeigt den linken Bildteil → x sinkt.
        const dx = ((e.clientX - d.startX) / size) * (100 / d.startFrame.zoom);
        const dy = ((e.clientY - d.startY) / size) * (100 / d.startFrame.zoom);
        updateCropFrame({
          zoom: d.startFrame.zoom,
          x: clampPct(d.startFrame.x - dx),
          y: clampPct(d.startFrame.y - dy),
        });
      },
      onPointerUp: (e: { pointerId: number; currentTarget: { releasePointerCapture?: (id: number) => void } }) => {
        cropDragRef.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      },
      onWheel: (e: { deltaY: number; preventDefault: () => void }) => {
        e.preventDefault();
        const zoom = Math.max(1, Math.min(5, frame.zoom - e.deltaY * 0.002));
        updateCropFrame({ ...frame, zoom });
      },
      style: {
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        zIndex: 2147483646,
        cursor: cropDragRef.current ? "grabbing" : "grab",
        touchAction: "none",
        boxShadow: "0 0 0 2px #F5A623, 0 0 0 100vmax rgba(0,0,0,0.45)",
      },
    });

    // Sichtbarer Bildausschnitt im Viewport – die Controls ankern sich daran,
    // damit sie nie unter dem unteren Bildschirmrand verschwinden.
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const visTop = Math.max(rect.top, 0);
    const visBottom = Math.min(rect.top + rect.height, vh);
    const centerX = (Math.max(rect.left, 0) + Math.min(rect.left + rect.width, vw)) / 2;

    const zoomTo = (z: number) => updateCropFrame({ ...frame, zoom: Math.max(1, Math.min(5, z)) });

    const glass = {
      background: "rgba(14,15,18,0.82)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      border: "1px solid rgba(255,255,255,0.09)",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    };

    // Hinweis-Chip oben im sichtbaren Bildausschnitt (rein informativ).
    const hint = createElement(
      "div",
      {
        style: {
          ...glass,
          position: "fixed",
          top: visTop + 14,
          left: centerX,
          transform: "translateX(-50%)",
          zIndex: 2147483647,
          padding: "6px 12px",
          borderRadius: 999,
          color: "#C9CCD3",
          fontSize: 11.5,
          letterSpacing: 0.2,
          pointerEvents: "none" as const,
          whiteSpace: "nowrap" as const,
        },
      },
      "Drag to move · Scroll or use the slider to zoom",
    );

    const zoomStep = (label: string, delta: number) =>
      createElement(
        "button",
        {
          type: "button",
          title: delta > 0 ? "Zoom in" : "Zoom out",
          onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
          onClick: () => zoomTo(frame.zoom + delta),
          style: {
            width: 26,
            height: 26,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            border: "none",
            background: "transparent",
            color: "#A5A8B0",
            fontSize: 15,
            lineHeight: 1,
            cursor: "pointer",
          },
        },
        label,
      );

    // Schwebende Pill-Leiste, unten mittig ÜBER dem sichtbaren Bildbereich.
    const controls = createElement(
      "div",
      {
        "data-editkraft-crop-controls": "true",
        onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
        style: {
          ...glass,
          position: "fixed",
          top: Math.max(10, Math.min(visBottom - 66, vh - 66)),
          left: centerX,
          transform: "translateX(-50%)",
          zIndex: 2147483647,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 999,
          boxShadow: "0 16px 40px -12px rgba(0,0,0,0.65)",
          whiteSpace: "nowrap" as const,
        },
      },
      zoomStep("−", -0.25),
      createElement("input", {
        type: "range",
        min: 1,
        max: 5,
        step: 0.01,
        value: frame.zoom,
        onChange: (e: { target: { value: string } }) => zoomTo(Number(e.target.value) || 1),
        style: { width: 130, accentColor: "#F5A623", cursor: "pointer" },
      }),
      zoomStep("+", 0.25),
      createElement("span", {
        style: { width: 1, height: 18, background: "rgba(255,255,255,0.12)", margin: "0 2px" },
      }),
      createElement(
        "button",
        {
          type: "button",
          onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
          onClick: commitCrop,
          style: {
            padding: "7px 16px",
            borderRadius: 999,
            border: "none",
            background: "#F5A623",
            color: "#1A1400",
            fontWeight: 650,
            cursor: "pointer",
            fontSize: 13,
          },
        },
        "Done",
      ),
      createElement(
        "button",
        {
          type: "button",
          title: "Cancel",
          onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
          onClick: cancelCrop,
          style: {
            padding: "7px 13px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "transparent",
            color: "#A5A8B0",
            cursor: "pointer",
            fontSize: 13,
          },
        },
        "Cancel",
      ),
    );

    return createElement(Fragment, null, surface, hint, controls);
  };

  return createElement(
    Fragment,
    null,
    createElement(
      "div",
      { ref: containerRef, onInput, onClickCapture, onFocusCapture: onFocusIn, onBlurCapture: onFocusOut },
      blocksEl,
      toolbar
      ? createElement(
          "div",
          {
            "data-editkraft-toolbar": "true",
            // Toolbar-Klicks dürfen die Selektion im contentEditable nicht verlieren.
            onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
            style: {
              position: "fixed",
              top: toolbar.top,
              left: toolbar.left,
              display: "flex",
              alignItems: "center",
              gap: 1,
              padding: 4,
              background: "#1A1C1F",
              border: "1px solid #2E3138",
              borderRadius: 10,
              boxShadow: "0 10px 30px -6px rgba(0,0,0,0.55)",
              zIndex: 2147483647,
              fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
              userSelect: "none",
            },
          },
          fmtButton({ label: "¶", title: "Paragraph", active: isParagraph, onClick: () => applyFormat("p") }),
          fmtButton({ label: "H2", title: "Heading 2", active: fmt?.block === "h2", onClick: () => applyFormat("h2") }),
          fmtButton({ label: "H3", title: "Heading 3", active: fmt?.block === "h3", onClick: () => applyFormat("h3") }),
          divider(),
          fmtButton({
            label: "B",
            title: "Bold",
            active: !!fmt?.bold,
            onClick: () => applyFormat("bold"),
            style: { fontWeight: 800 },
          }),
          fmtButton({
            label: "I",
            title: "Italic",
            active: !!fmt?.italic,
            onClick: () => applyFormat("italic"),
            style: { fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif" },
          }),
          fmtButton({
            label: "U",
            title: "Underline",
            active: !!fmt?.underline,
            onClick: () => applyFormat("underline"),
            style: { textDecoration: "underline" },
          }),
          fmtButton({
            label: "S",
            title: "Strikethrough",
            active: !!fmt?.strike,
            onClick: () => applyFormat("strikethrough"),
            style: { textDecoration: "line-through" },
          }),
          divider(),
          fmtButton({
            label: "UL",
            title: "Bullet list",
            active: !!fmt?.ul,
            onClick: () => applyFormat("insertUnorderedList"),
          }),
          fmtButton({
            label: "OL",
            title: "Numbered list",
            active: !!fmt?.ol,
            onClick: () => applyFormat("insertOrderedList"),
          }),
          fmtButton({
            label: "❝",
            title: "Quote",
            active: fmt?.block === "blockquote",
            onClick: () => applyFormat("blockquote"),
          }),
          divider(),
          fmtButton({ label: linkIcon, title: "Link", active: !!linkPopover, onClick: () => applyFormat("link") }),
        )
      : null,
    ),
    renderLinkPopover(),
    renderSelectPopover(),
    renderImagePopover(),
    renderCropOverlay(),
  );
}
