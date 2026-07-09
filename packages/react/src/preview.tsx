"use client";

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
import type { Registry } from "./registry";
import { updateBlockProps } from "./tree";

export interface EditkraftPreviewProps {
  /** Draft-Content, serverseitig (Draft Mode) geladen und übergeben. */
  content: PageContent;
  registry: Registry;
  /** Erlaubte Studio-Origin (Ziel für postMessage und Origin-Check eingehender Nachrichten). */
  studioOrigin: string;
}

function postToStudio(message: unknown, origin: string): void {
  if (typeof window === "undefined") return;
  // In der echten Nutzung ist window.parent das Studio-iframe.
  window.parent.postMessage(message, origin);
}

const toolbarBtn = {
  color: "#fff",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
  padding: "2px 8px",
} as const;

function PreviewBlocks({
  blocks,
  registry,
  selectedId,
  onSelect,
}: {
  blocks: Block[];
  registry: Registry;
  selectedId: string | null;
  onSelect: (id: string) => void;
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
              ...(parsed.data as Record<string, unknown>),
              children:
                block.children && block.children.length > 0
                  ? createElement(PreviewBlocks, {
                      blocks: block.children,
                      registry,
                      selectedId,
                      onSelect,
                    })
                  : undefined,
            })
          : createElement("div", { style: { padding: 8, color: "#92400e" } }, `Block "${block.type}"`);

      // Klick-Overlay pro Block: Selektion an das Studio melden.
      return createElement(
        "div",
        {
          key: block.id,
          "data-editkraft-block-id": block.id,
          "data-editkraft-selected": selectedId === block.id ? "true" : undefined,
          onClick: (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            onSelect(block.id);
          },
          style: {
            outline: selectedId === block.id ? "2px solid #2563eb" : undefined,
            cursor: "pointer",
          },
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
 */
export function EditkraftPreview({
  content,
  registry,
  studioOrigin,
}: EditkraftPreviewProps): ReactNode {
  const [tree, setTree] = useState<PageContent>(content);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
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

  // RichText-Mini-Toolbar: bei nicht-leerer Selektion im fokussierten richText-Feld einblenden.
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

  const onClickCapture = (e: { target: EventTarget | null; stopPropagation: () => void }) => {
    const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-ek-field]");
    if (!el) return;
    const wrapper = el.closest<HTMLElement>("[data-editkraft-block-id]");
    const blockId = wrapper?.getAttribute("data-editkraft-block-id") ?? null;
    const fieldKey = el.getAttribute("data-ek-field") ?? null;
    if (!blockId || !fieldKey) return;
    const type = blockTypeOf(blockId);
    const kind = type ? fieldKindOf(type, fieldKey) : undefined;
    if (kind === "image") {
      // Self-contained: Auswahl selbst setzen und Event stoppen, damit der
      // bubble-phase onClick des Block-Wrappers (onSelect) nicht zusätzlich
      // ein zweites, redundantes ek:select nach ek:focus-field sendet.
      setSelectedId(blockId);
      postToStudio(createMessage("ek:select", { blockId }), studioOrigin);
      postToStudio(createMessage("ek:focus-field", { blockId, fieldKey }), studioOrigin);
      e.stopPropagation();
    }
  };

  const onSelect = (id: string) => {
    setSelectedId(id);
    postToStudio(createMessage("ek:select", { blockId: id }), studioOrigin);
  };

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

  return createElement(
    "div",
    { ref: containerRef, onInput, onClickCapture, onFocusCapture: onFocusIn, onBlurCapture: onFocusOut },
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
}
