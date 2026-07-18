import { z } from "zod";

/**
 * Field primitives: Zod schemas with attached metadata, from which the Studio
 * automatically generates input forms. The renderer uses the Zod side for
 * validation; the Studio reads the (serializable) metadata via getFieldMeta.
 *
 * The metadata is attached to the concrete schema instance (WeakMap). It
 * survives placement in `z.object({...})` and wrapping with `.optional()`,
 * but NOT `.describe()` (which clones the instance) — labels therefore come
 * from the primitive config, not from `.describe()`.
 */

export type EkFieldKind =
  | "text"
  | "richText"
  | "image"
  | "link"
  | "color"
  | "select"
  | "list"
  | "reference";

export type EkSelectOption = { value: string; label?: string };

export type EkFieldMeta =
  | { kind: "text"; label?: string; multiline?: boolean }
  | { kind: "richText"; label?: string }
  | { kind: "image"; label?: string }
  | { kind: "link"; label?: string }
  | { kind: "color"; label?: string }
  | { kind: "select"; label?: string; options: EkSelectOption[] }
  | { kind: "list"; label?: string; item: EkFieldMeta }
  | { kind: "reference"; label?: string; to: string };

const fieldMeta = new WeakMap<z.ZodTypeAny, EkFieldMeta>();

function tag<T extends z.ZodTypeAny>(schema: T, meta: EkFieldMeta): T {
  fieldMeta.set(schema, meta);
  return schema;
}

/** Unwraps optional/nullable/default until the primitive instance is reached. */
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

/** Reads a field's Editkraft metadata (also through optional/default wrappers). */
export function getFieldMeta(schema: z.ZodTypeAny): EkFieldMeta | undefined {
  return fieldMeta.get(unwrap(schema));
}

export function isEkField(schema: z.ZodTypeAny): boolean {
  return getFieldMeta(schema) !== undefined;
}

// --- Value schemas of the complex primitives (part of the contract) ----------

/**
 * Non-destructive 1:1 frame: `x`/`y` = focus point in percent (object-position),
 * `zoom` = magnification beyond "cover". The original asset stays untouched.
 */
export const ekImageFrame = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  zoom: z.number().min(1).max(5),
});
export type EkImageFrame = z.infer<typeof ekImageFrame>;

export const DEFAULT_IMAGE_FRAME: EkImageFrame = { x: 50, y: 50, zoom: 1 };

/**
 * Wert eines ekImage-FELDES — seit dem Medienfeld ein Bild ODER ein Video.
 * Der Registry-Feldtyp bleibt "image" (alle bestehenden data-ek-field-Verträge
 * gelten weiter); nur der WERT trägt das Medium über die drei optionalen Felder:
 * - `kind`: "video" macht den Wert zum Video; fehlend/"image" = Bild (abwärtskompatibel).
 * - `poster`: Vorschaubild-URL (nur bei Videos sinnvoll).
 * - `controls`: zeigt Video-Steuerelemente; ohne (Default) läuft das Video als
 *   stummes Hintergrund-Video (muted/loop/autoplay).
 * Alle drei sind optional, sodass bestehende Bild-Werte (ohne `kind`) weiter validieren.
 */
export const ekImageValue = z.object({
  assetId: z.string(),
  alt: z.string().optional(),
  url: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  frame: ekImageFrame.optional(),
  kind: z.enum(["image", "video"]).optional(),
  poster: z.string().optional(),
  controls: z.boolean().optional(),
});
export type EkImageValue = z.infer<typeof ekImageValue>;

/**
 * Erweiterter Wert-Typ für den Renderer (EkMedia): identisch zu EkImageValue,
 * aber unter dem sprechenden Namen des Mediums. Bestehende Bild-Werte ohne
 * `kind` gelten als Bild.
 */
export type EkMediaValue = EkImageValue;

/**
 * Styles for non-destructive 1:1 framing — identical in the live preview
 * and on the published page. The container is square + `overflow:hidden`,
 * the image sits inside as `object-fit:cover` and is framed around the focus
 * point via `object-position` (pan) and `scale` (zoom).
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

/** Rich text as a sanitized HTML subset (see RICH_TEXT_ALLOWLIST / sanitizeRichText). */
export function ekRichText(config: { label?: string } = {}) {
  return tag(z.string(), { kind: "richText", ...config });
}

export function ekImage(config: { label?: string } = {}) {
  return tag(z.object({ ...ekImageValue.shape }), { kind: "image", ...config });
}

export function ekLink(config: { label?: string } = {}) {
  return tag(z.object({ ...ekLinkValue.shape }), { kind: "link", ...config });
}

/** Color as a token or hex (#rgb / #rrggbb). */
export function ekColor(config: { label?: string } = {}) {
  return tag(
    z.string().refine((v) => HEX_COLOR.test(v) || /^[a-z][a-z0-9-]*$/i.test(v), {
      message: "Color must be hex (#rrggbb) or a token name",
    }),
    { kind: "color", ...config },
  );
}

/**
 * Strikte Auswahl aus festen Werten (z. B. Icon-Schlüssel, Layout-Varianten).
 * Die Preview zeigt dafür ein Options-Popover statt contenteditable — Blöcke
 * rendern den Wert selbst (mit Fallback für unbekannte Werte empfohlen).
 */
export function ekSelect(config: { options: EkSelectOption[]; label?: string }) {
  if (!config.options.length) {
    throw new Error("ekSelect: options must not be empty");
  }
  const values = config.options.map((o) => o.value);
  if (new Set(values).size !== values.length) {
    throw new Error("ekSelect: option values must be unique");
  }
  return tag(
    z.string().refine((v) => values.includes(v), {
      message: `Value must be one of: ${values.join(", ")}`,
    }),
    { kind: "select", options: config.options, ...(config.label ? { label: config.label } : {}) },
  );
}

/** List of same-kind primitives (e.g. ekList(ekText())). */
export function ekList<T extends z.ZodTypeAny>(
  item: T,
  config: { label?: string } = {},
) {
  const itemMeta = getFieldMeta(item);
  if (!itemMeta) {
    throw new Error("ekList: item must be an Editkraft primitive");
  }
  return tag(z.array(item), { kind: "list", item: itemMeta, ...config });
}

/** Reference to another record (e.g. another page). */
export function ekReference(config: { to: string; label?: string }) {
  return tag(z.object({ ...ekReferenceValue.shape }), {
    kind: "reference",
    ...config,
  });
}
