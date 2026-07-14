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

/**
 * Reservierter Referenz-Knoten (V2 „Symbols", Roadmap 2.4): verweist auf eine
 * Zeile in `ek_symbols`. In v1 NICHT auflösbar — der Renderer wirft dafür den
 * definierten „nicht unterstützt"-Fehler. Der Knoten ist trotzdem schon jetzt
 * Teil des Wire-Formats, damit V2 kein Major-Release des Schemas braucht:
 * jeder ab heute ausgelieferte Parser akzeptiert Symbol-Knoten.
 */
export const symbolRefSchema = z.object({
  id: z.string().min(1),
  type: z.literal("$symbol"),
  symbolId: z.string().min(1),
});
export type SymbolRef = z.infer<typeof symbolRefSchema>;

/** Laufzeit-Guard für den reservierten Symbol-Knoten. */
export function isSymbolRef(node: unknown): node is SymbolRef {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as { type?: unknown }).type === "$symbol"
  );
}

// Der TS-Typ `Block` bleibt in v1 bewusst der Content-Block (kein Union):
// Konsumenten (Renderer, Studio) kompilieren unverändert; Symbol-Knoten
// erkennt man zur Laufzeit über isSymbolRef, BEVOR auf props/children
// zugegriffen wird. Der Typ-Umbau auf ein Union kommt mit V2.
export const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.union([
    symbolRefSchema,
    z.object({
      id: z.string().min(1),
      type: z.string().min(1),
      props: z.record(z.string(), z.unknown()),
      children: z.array(blockSchema).optional(),
    }),
  ]),
) as unknown as z.ZodType<Block>;

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

/**
 * Derives the serializable field descriptors from a Zod object shape.
 * Shared by defineBlock and defineGlobals; every field MUST be an
 * Editkraft primitive (only primitives are editable in the Studio).
 */
export function deriveFieldDescriptors(
  shape: z.ZodRawShape,
  context: string,
): BlockFieldDescriptor[] {
  const fields: BlockFieldDescriptor[] = [];
  for (const [key, field] of Object.entries(shape)) {
    const meta = getFieldMeta(field);
    if (!meta) {
      throw new Error(
        `${context}: field "${key}" does not use an Editkraft primitive ` +
          "(ekText, ekImage, …). Only primitives are editable in the Studio.",
      );
    }
    fields.push({ ...meta, key, optional: field.isOptional() });
  }
  return fields;
}

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

  const fields = deriveFieldDescriptors(
    input.schema.shape as z.ZodRawShape,
    `defineBlock("${input.type}")`,
  );

  return { ...input, slots: input.slots ?? [], fields };
}

/** Validates a block's props against the definition. */
export function validateBlockProps<Shape extends z.ZodRawShape>(
  definition: BlockDefinition<Shape>,
  props: unknown,
): z.infer<z.ZodObject<Shape>> {
  return definition.schema.parse(props);
}
