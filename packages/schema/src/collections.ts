import { z } from "zod";
import {
  deriveFieldDescriptors,
  type Block,
  type BlockFieldDescriptor,
} from "./block";

/**
 * Collections (Roadmap 2.8): strukturierte Item-Typen wie ein Blog — Items mit
 * festen Feldern (ek-Primitives) plus richText-Body, gespeichert in der
 * Kunden-Supabase (`ek_collections` / `ek_collection_items`).
 *
 * Fürs Studio-Protokoll wird ein Item als **synthetischer Ein-Block-Baum**
 * dargestellt (`itemToBlock`): `type = "$collection:<slug>"`, `props` = die
 * Feldwerte. Damit läuft die BESTEHENDE Preview-Bridge (ek:schema/tree/update/
 * focus-field, contenteditable, Toolbar, Bild-Picker) unverändert — das Studio
 * sieht eine „Seite mit einem Block".
 */

/** Präfix des synthetischen Item-Blocktyps: `"$collection:" + slug`. */
export const COLLECTION_BLOCK_PREFIX = "$collection:";

/** Serialisierbarer Feld-Deskriptor eines Collection-Felds (identische Form wie bei Blöcken). */
export type CollectionFieldDescriptor = BlockFieldDescriptor;

export interface CollectionDefinitionInput<
  Shape extends z.ZodRawShape = z.ZodRawShape,
> {
  /** URL-stabiler Bezeichner, z. B. "blog". */
  slug: string;
  /** Anzeigename im Studio, z. B. "Blog". */
  name: string;
  /** Item-Schema: jedes Feld MUSS ein ek-Primitive sein (ekText, ekRichText, …). */
  schema: z.ZodObject<Shape>;
}

export interface CollectionDefinition<Shape extends z.ZodRawShape = z.ZodRawShape>
  extends CollectionDefinitionInput<Shape> {
  /** Serialisierbare Feldliste (geht als `item_schema` in die DB und per ek:schema ans Studio). */
  fields: CollectionFieldDescriptor[];
}

// Kleinbuchstaben/Ziffern mit Bindestrichen — der Slug landet in URLs
// (`?collection=blog`) und im synthetischen Blocktyp ("$collection:blog").
const COLLECTION_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Definiert eine Collection — analog `defineBlock`: validiert, dass jedes Feld
 * ein Editkraft-Primitive ist, und leitet die serialisierbaren Feld-Deskriptoren
 * ab. Mindestens ein Feld ist Pflicht; richText-Felder sind erlaubt, aber nicht
 * erzwungen (Konvention: genau ein `ekRichText`-Body, mehrere sind ok).
 */
export function defineCollection<Shape extends z.ZodRawShape>(
  input: CollectionDefinitionInput<Shape>,
): CollectionDefinition<Shape> {
  if (!input.slug) throw new Error("defineCollection: slug is required");
  if (!COLLECTION_SLUG.test(input.slug)) {
    throw new Error(
      `defineCollection("${input.slug}"): slug must be a URL-safe slug ` +
        "(lowercase letters, digits, hyphens — e.g. \"blog\").",
    );
  }
  if (!input.name) {
    throw new Error(`defineCollection("${input.slug}"): name is required`);
  }

  const fields = deriveFieldDescriptors(
    input.schema.shape as z.ZodRawShape,
    `defineCollection("${input.slug}")`,
  );
  if (fields.length === 0) {
    throw new Error(
      `defineCollection("${input.slug}"): schema must define at least one field`,
    );
  }

  return { ...input, fields };
}

/** Validiert die Feldwerte eines Items gegen die Definition. */
export function validateItemData<Shape extends z.ZodRawShape>(
  definition: CollectionDefinition<Shape>,
  data: unknown,
): z.infer<z.ZodObject<Shape>> {
  return definition.schema.parse(data);
}

/**
 * Baut den synthetischen Ein-Block fürs Protokoll: die Preview-Seite rendert
 * ein Item als `PageContent` mit genau diesem Block, das Studio adressiert es
 * über `blockId = itemId` (ek:update/select/focus-field wie bei echten Blöcken).
 */
export function itemToBlock(
  collectionSlug: string,
  itemId: string,
  data: Record<string, unknown>,
): Block {
  return {
    id: itemId,
    type: COLLECTION_BLOCK_PREFIX + collectionSlug,
    props: data,
  };
}

/**
 * Laufzeit-Guard für synthetische Collection-Blocktypen. Bewusst NICHT über
 * das bloße "$"-Präfix: "$symbol" (reservierter V2-Knoten) ist KEIN
 * Collection-Typ, und ein leerer Slug ("$collection:") zählt nicht.
 */
export function isCollectionBlockType(type: string): boolean {
  return (
    type.startsWith(COLLECTION_BLOCK_PREFIX) &&
    type.length > COLLECTION_BLOCK_PREFIX.length
  );
}

/** Extrahiert den Collection-Slug aus einem synthetischen Blocktyp (sonst null). */
export function collectionSlugOfBlockType(type: string): string | null {
  return isCollectionBlockType(type)
    ? type.slice(COLLECTION_BLOCK_PREFIX.length)
    : null;
}
