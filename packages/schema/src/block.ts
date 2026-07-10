import { z } from "zod";
import { SCHEMA_VERSION } from "./version";
import { getFieldMeta, type EkFieldMeta } from "./primitives";

/**
 * Block tree format — the content of ek_page_versions.content (JSONB).
 * `id` is stable across edits (nanoid), `type` is a key in the customer
 * project's block registry, `props` is validated against the block's Zod
 * schema, `children` only exists for blocks with slots.
 */
export interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  // `| undefined` explicit so the recursive z.lazy derivation matches
  // z.array(...).optional() under exactOptionalPropertyTypes.
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

/** Empty but valid PageContent with the current schema version. */
export function emptyPageContent(): PageContent {
  return { schemaVersion: SCHEMA_VERSION, blocks: [] };
}

// --- Block definitions (what customer projects register) ---------------------

/** Serializable field description for the Studio (derived from the Zod schema). */
export type BlockFieldDescriptor = EkFieldMeta & { key: string; optional: boolean };

export interface BlockDefinitionInput<
  Shape extends z.ZodRawShape = z.ZodRawShape,
> {
  type: string;
  schema: z.ZodObject<Shape>;
  /** Named slots for children, e.g. ['columns']. */
  slots?: string[];
  /** Display name in the Studio. */
  label: string;
}

export interface BlockDefinition<Shape extends z.ZodRawShape = z.ZodRawShape>
  extends BlockDefinitionInput<Shape> {
  slots: string[];
  /** Serializable field list derived from the schema (for the Studio). */
  fields: BlockFieldDescriptor[];
}

/**
 * Defines a block. Validates that every field is an Editkraft primitive,
 * and derives the serializable field description for the Studio.
 */
export function defineBlock<Shape extends z.ZodRawShape>(
  input: BlockDefinitionInput<Shape>,
): BlockDefinition<Shape> {
  if (!input.type) throw new Error("defineBlock: type is required");
  if (!input.label) throw new Error(`defineBlock("${input.type}"): label is required`);

  const shape = input.schema.shape as z.ZodRawShape;
  const fields: BlockFieldDescriptor[] = [];

  for (const [key, field] of Object.entries(shape)) {
    const meta = getFieldMeta(field);
    if (!meta) {
      throw new Error(
        `defineBlock("${input.type}"): field "${key}" does not use an Editkraft primitive ` +
          "(ekText, ekImage, …). Only primitives are editable in the Studio.",
      );
    }
    fields.push({ ...meta, key, optional: field.isOptional() });
  }

  return { ...input, slots: input.slots ?? [], fields };
}

/** Validates a block's props against the definition. */
export function validateBlockProps<Shape extends z.ZodRawShape>(
  definition: BlockDefinition<Shape>,
  props: unknown,
): z.infer<z.ZodObject<Shape>> {
  return definition.schema.parse(props);
}
