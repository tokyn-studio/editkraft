import { z } from "zod";

/**
 * Feld-Primitives: Zod-Schemas mit angehängten Metadaten, aus denen das Studio
 * automatisch Eingabemasken generiert. Der Renderer nutzt die Zod-Seite zur
 * Validierung; das Studio liest die Metadaten (serialisierbar) über getFieldMeta.
 *
 * Die Metadaten hängen an der konkreten Schema-Instanz (WeakMap). Das überlebt
 * die Platzierung in `z.object({...})` und das Umwickeln mit `.optional()`,
 * NICHT aber `.describe()` (klont die Instanz) – Labels kommen deshalb aus der
 * Primitive-Konfiguration, nicht aus `.describe()`.
 */

export type EkFieldKind =
  | "text"
  | "richText"
  | "image"
  | "link"
  | "color"
  | "list"
  | "reference";

export type EkFieldMeta =
  | { kind: "text"; label?: string; multiline?: boolean }
  | { kind: "richText"; label?: string }
  | { kind: "image"; label?: string }
  | { kind: "link"; label?: string }
  | { kind: "color"; label?: string }
  | { kind: "list"; label?: string; item: EkFieldMeta }
  | { kind: "reference"; label?: string; to: string };

const fieldMeta = new WeakMap<z.ZodTypeAny, EkFieldMeta>();

function tag<T extends z.ZodTypeAny>(schema: T, meta: EkFieldMeta): T {
  fieldMeta.set(schema, meta);
  return schema;
}

/** Wickelt optional/nullable/default ab, bis die Primitive-Instanz erreicht ist. */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let s: z.ZodTypeAny = schema;
  for (;;) {
    if (s instanceof z.ZodOptional || s instanceof z.ZodNullable) {
      s = s.unwrap() as z.ZodTypeAny;
    } else if (s instanceof z.ZodDefault) {
      s = s.removeDefault() as z.ZodTypeAny;
    } else {
      return s;
    }
  }
}

/** Liest die Editkraft-Metadaten eines Feldes (auch durch optional/default hindurch). */
export function getFieldMeta(schema: z.ZodTypeAny): EkFieldMeta | undefined {
  return fieldMeta.get(unwrap(schema));
}

export function isEkField(schema: z.ZodTypeAny): boolean {
  return getFieldMeta(schema) !== undefined;
}

// --- Wert-Schemas der komplexen Primitives (Teil des Contracts) --------------

/**
 * Non-destruktiver 1:1-Rahmen: `x`/`y` = Fokuspunkt in Prozent (object-position),
 * `zoom` = Vergrößerung über „cover" hinaus. Das Original-Asset bleibt unangetastet.
 */
export const ekImageFrame = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  zoom: z.number().min(1).max(5),
});
export type EkImageFrame = z.infer<typeof ekImageFrame>;

export const DEFAULT_IMAGE_FRAME: EkImageFrame = { x: 50, y: 50, zoom: 1 };

export const ekImageValue = z.object({
  assetId: z.string(),
  alt: z.string().optional(),
  url: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  frame: ekImageFrame.optional(),
});
export type EkImageValue = z.infer<typeof ekImageValue>;

/**
 * Styles für nicht-destruktives 1:1-Framing – identisch in der Live-Vorschau
 * und auf der veröffentlichten Seite. Container ist quadratisch + `overflow:hidden`,
 * das Bild liegt als `object-fit:cover` darin und wird per `object-position` (Pan)
 * und `scale` (Zoom) um den Fokuspunkt gerahmt.
 */
export function imageFrameStyles(frame?: EkImageFrame): {
  container: Record<string, string>;
  image: Record<string, string>;
} {
  const f = frame ?? DEFAULT_IMAGE_FRAME;
  const pos = `${f.x}% ${f.y}%`;
  return {
    container: {
      position: "relative",
      aspectRatio: "1 / 1",
      overflow: "hidden",
    },
    image: {
      display: "block",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: pos,
      transform: `scale(${f.zoom})`,
      transformOrigin: pos,
    },
  };
}

export const ekLinkValue = z.object({
  href: z.string(),
  label: z.string().optional(),
  external: z.boolean().optional(),
});
export type EkLinkValue = z.infer<typeof ekLinkValue>;

export const ekReferenceValue = z.object({
  id: z.string(),
});
export type EkReferenceValue = z.infer<typeof ekReferenceValue>;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// --- Primitives --------------------------------------------------------------

export function ekText(config: { label?: string; multiline?: boolean } = {}) {
  return tag(z.string(), { kind: "text", ...config });
}

/** Rich-Text als sanitisiertes HTML-Subset (siehe RICH_TEXT_ALLOWLIST / sanitizeRichText). */
export function ekRichText(config: { label?: string } = {}) {
  return tag(z.string(), { kind: "richText", ...config });
}

export function ekImage(config: { label?: string } = {}) {
  return tag(z.object({ ...ekImageValue.shape }), { kind: "image", ...config });
}

export function ekLink(config: { label?: string } = {}) {
  return tag(z.object({ ...ekLinkValue.shape }), { kind: "link", ...config });
}

/** Farbe als Token oder Hex (#rgb / #rrggbb). */
export function ekColor(config: { label?: string } = {}) {
  return tag(
    z.string().refine((v) => HEX_COLOR.test(v) || /^[a-z][a-z0-9-]*$/i.test(v), {
      message: "Farbe muss Hex (#rrggbb) oder ein Token-Name sein",
    }),
    { kind: "color", ...config },
  );
}

/** Liste gleichartiger Primitives (z. B. ekList(ekText())). */
export function ekList<T extends z.ZodTypeAny>(
  item: T,
  config: { label?: string } = {},
) {
  const itemMeta = getFieldMeta(item);
  if (!itemMeta) {
    throw new Error("ekList: item muss ein Editkraft-Primitive sein");
  }
  return tag(z.array(item), { kind: "list", item: itemMeta, ...config });
}

/** Referenz auf einen anderen Datensatz (z. B. eine andere Page). */
export function ekReference(config: { to: string; label?: string }) {
  return tag(z.object({ ...ekReferenceValue.shape }), {
    kind: "reference",
    ...config,
  });
}
