"use client";

import { createElement, Fragment, useEffect, useState, type ReactNode } from "react";
import {
  parseMessage,
  createMessage,
  isAllowedOrigin,
  type Block,
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

  useEffect(() => {
    postToStudio(createMessage("ek:ready", { schemaVersion: content.schemaVersion }), studioOrigin);
    postToStudio(createMessage("ek:schema", { blocks: registry.descriptors() }), studioOrigin);
    postToStudio(createMessage("ek:tree", { content }), studioOrigin);

    const onMessage = (event: MessageEvent) => {
      if (!isAllowedOrigin(event.origin, studioOrigin)) return;
      const message = parseMessage(event.data);
      if (!message) return;
      if (message.type === "ek:update") {
        setTree((current) => updateBlockProps(current, message.blockId, message.props));
      } else if (message.type === "ek:select") {
        setSelectedId(message.blockId);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // content/studioOrigin sind pro Preview-Render stabil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioOrigin]);

  const onSelect = (id: string) => {
    setSelectedId(id);
    postToStudio(createMessage("ek:select", { blockId: id }), studioOrigin);
  };

  return createElement(PreviewBlocks, {
    blocks: tree.blocks,
    registry,
    selectedId,
    onSelect,
  });
}
