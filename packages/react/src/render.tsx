import { Fragment, type ReactNode, createElement } from "react";
import { sanitizeRichText, type Block, type BlockFieldDescriptor } from "@editkraft/schema";
import type { Registry } from "./registry";

export interface RenderOptions {
  /** Dev-Modus zeigt für unbekannte/ungültige Blöcke einen sichtbaren Platzhalter. */
  dev?: boolean;
}

function isDev(options: RenderOptions): boolean {
  return options.dev ?? process.env.NODE_ENV !== "production";
}

function Placeholder({ text }: { text: string }): ReactNode {
  return createElement(
    "div",
    {
      "data-editkraft-placeholder": true,
      style: {
        border: "1px dashed #f59e0b",
        background: "#fffbeb",
        color: "#92400e",
        padding: "8px 12px",
        fontFamily: "monospace",
        fontSize: "13px",
      },
    },
    text,
  );
}

/**
 * Sanitisiert alle richText-Props zentral, bevor sie an die Komponente gehen –
 * secure-by-default, unabhängig davon, ob der Block-Autor selbst
 * `sanitizeRichText` aufruft. Mutiert `props` nicht.
 *
 * Bekannte Einschränkung: nur Top-Level-richText-Felder werden erfasst.
 * richText INNERHALB von `ekList(...)`-Items wird (noch) nicht sanitisiert.
 */
function sanitizeRichTextProps(
  props: Record<string, unknown>,
  fields: BlockFieldDescriptor[],
): Record<string, unknown> {
  let result = props;
  for (const field of fields) {
    if (field.kind !== "richText") continue;
    const value = props[field.key];
    if (typeof value !== "string") continue;
    if (result === props) result = { ...props };
    result[field.key] = sanitizeRichText(value);
  }
  return result;
}

/**
 * Rendert einen einzelnen Block über die Registry.
 * - Unbekannter Typ: Production → console.warn + überspringen (null),
 *   Dev → sichtbarer Platzhalter.
 * - Ungültige Props (Schema): Dev → Platzhalter, Production → warn + überspringen.
 */
function renderBlock(block: Block, registry: Registry, options: RenderOptions): ReactNode {
  const entry = registry.get(block.type);
  if (!entry) {
    if (isDev(options)) {
      return createElement(Placeholder, {
        key: block.id,
        text: `Unbekannter Block-Typ "${block.type}" (nicht in der Registry).`,
      });
    }
    console.warn(`[editkraft] Unbekannter Block-Typ "${block.type}" übersprungen.`);
    return null;
  }

  const parsed = entry.definition.schema.safeParse(block.props);
  if (!parsed.success) {
    if (isDev(options)) {
      return createElement(Placeholder, {
        key: block.id,
        text: `Ungültige Props für Block "${block.type}": ${parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join(", ")}`,
      });
    }
    console.warn(`[editkraft] Ungültige Props für Block "${block.type}" übersprungen.`);
    return null;
  }

  const children =
    block.children && block.children.length > 0
      ? renderBlocks(block.children, registry, options)
      : undefined;

  const props = sanitizeRichTextProps(
    parsed.data as Record<string, unknown>,
    entry.definition.fields,
  );

  return createElement(entry.component, {
    key: block.id,
    ...props,
    children,
  });
}

/** Rendert eine Block-Liste zu ReactNode. */
export function renderBlocks(
  blocks: Block[],
  registry: Registry,
  options: RenderOptions = {},
): ReactNode {
  return createElement(
    Fragment,
    null,
    ...blocks.map((block) => renderBlock(block, registry, options)),
  );
}
