import { Fragment, type ReactNode, createElement } from "react";
import { sanitizeRichText, isSymbolRef, type Block, type BlockFieldDescriptor } from "@editkraft/schema";
import { EditkraftError } from "./errors";
import type { Registry } from "./registry";

export interface RenderOptions {
  /** Dev mode shows a visible placeholder for unknown/invalid blocks. */
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
 * Sanitizes all richText props centrally before they reach the component —
 * secure by default, regardless of whether the block author calls
 * `sanitizeRichText` themselves. Does not mutate `props`.
 *
 * Known limitation: only top-level richText fields are covered.
 * richText INSIDE `ekList(...)` items is not (yet) sanitized.
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
 * Renders a single block via the registry.
 * - Unknown type: production → console.warn + skip (null),
 *   dev → visible placeholder.
 * - Invalid props (schema): dev → placeholder, production → warn + skip.
 */
function renderBlock(block: Block, registry: Registry, options: RenderOptions): ReactNode {
  // Reservierter V2-Knoten (Roadmap 2.4): das Wire-Format akzeptiert
  // $symbol-Referenzen schon heute, auflösen kann sie erst V2 — definierter
  // Fehler statt stillem Skip, damit niemand Symbols versehentlich shippt.
  if (isSymbolRef(block)) {
    throw new EditkraftError(
      "SYMBOLS_UNSUPPORTED",
      "Symbol nodes ($symbol) are reserved for a future release and cannot be rendered yet. " +
        "Remove the symbol reference or upgrade once symbols ship.",
    );
  }
  const entry = registry.get(block.type);
  if (!entry) {
    if (isDev(options)) {
      return createElement(Placeholder, {
        key: block.id,
        text: `Unknown block type "${block.type}" (not in the registry).`,
      });
    }
    console.warn(`[editkraft] Unknown block type "${block.type}" skipped.`);
    return null;
  }

  const parsed = entry.definition.schema.safeParse(block.props);
  if (!parsed.success) {
    if (isDev(options)) {
      return createElement(Placeholder, {
        key: block.id,
        text: `Invalid props for block "${block.type}": ${parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join(", ")}`,
      });
    }
    console.warn(`[editkraft] Invalid props for block "${block.type}" skipped.`);
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

/** Renders a list of blocks to a ReactNode. */
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
