import { z } from "zod";
import { SCHEMA_VERSION } from "./version";
import { getFieldMeta, type EkFieldMeta } from "./primitives";

/**
 * Blocktree-Format – der Inhalt von ek_page_versions.content (JSONB).
 * `id` ist stabil über Edits hinweg (nanoid), `type` ist ein Key in der
 * Block-Registry des Kundenprojekts, `props` wird gegen das Zod-Schema des
 * Blocks validiert, `children` existiert nur bei Blöcken mit Slots.
 */
export interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  // `| undefined` explizit, damit die rekursive z.lazy-Ableitung unter
  // exactOptionalPropertyTypes zu z.array(...).optional() passt.
  children?: Block[] | undefined;
}

export const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    props: z.record(z.string(), z.unknown()),
    children: z.array(blockSchema).optional(),
  }),
);

export const pageContentSchema = z.object({
  schemaVersion: z.string(),
  blocks: z.array(blockSchema),
});
export type PageContent = z.infer<typeof pageContentSchema>;

/** Leerer, aber gültiger PageContent mit der aktuellen Schema-Version. */
export function emptyPageContent(): PageContent {
  return { schemaVersion: SCHEMA_VERSION, blocks: [] };
}

// --- Block-Definitionen (was Kundenprojekte registrieren) --------------------

/** Serialisierbare Feldbeschreibung für das Studio (aus dem Zod-Schema abgeleitet). */
export type BlockFieldDescriptor = EkFieldMeta & { key: string; optional: boolean };

export interface BlockDefinitionInput<
  Shape extends z.ZodRawShape = z.ZodRawShape,
> {
  type: string;
  schema: z.ZodObject<Shape>;
  /** Benannte Slots für children, z. B. ['columns']. */
  slots?: string[];
  /** Anzeigename im Studio. */
  label: string;
}

export interface BlockDefinition<Shape extends z.ZodRawShape = z.ZodRawShape>
  extends BlockDefinitionInput<Shape> {
  slots: string[];
  /** Aus dem Schema abgeleitete, serialisierbare Feldliste (für das Studio). */
  fields: BlockFieldDescriptor[];
}

/**
 * Definiert einen Block. Validiert, dass jedes Feld ein Editkraft-Primitive ist,
 * und leitet die serialisierbare Feldbeschreibung für das Studio ab.
 */
export function defineBlock<Shape extends z.ZodRawShape>(
  input: BlockDefinitionInput<Shape>,
): BlockDefinition<Shape> {
  if (!input.type) throw new Error("defineBlock: type ist erforderlich");
  if (!input.label) throw new Error(`defineBlock("${input.type}"): label ist erforderlich`);

  const shape = input.schema.shape as z.ZodRawShape;
  const fields: BlockFieldDescriptor[] = [];

  for (const [key, field] of Object.entries(shape)) {
    const meta = getFieldMeta(field);
    if (!meta) {
      throw new Error(
        `defineBlock("${input.type}"): Feld "${key}" nutzt kein Editkraft-Primitive ` +
          "(ekText, ekImage, …). Nur Primitives sind im Studio editierbar.",
      );
    }
    fields.push({ ...meta, key, optional: field.isOptional() });
  }

  return { ...input, slots: input.slots ?? [], fields };
}

/** Validiert die props eines Blocks gegen die Definition. */
export function validateBlockProps<Shape extends z.ZodRawShape>(
  definition: BlockDefinition<Shape>,
  props: unknown,
): z.infer<z.ZodObject<Shape>> {
  return definition.schema.parse(props);
}
