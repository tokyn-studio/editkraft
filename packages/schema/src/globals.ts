import { z } from "zod";
import { deriveFieldDescriptors, type BlockFieldDescriptor } from "./block";

/**
 * Site-Globals: site-weite Inhalte (Kontaktdaten, Claim, …), die der Kunde in
 * Code definiert und die in der Kunden-Supabase (`ek_globals`, eine Zeile mit
 * draft/published) gespeichert werden. Bearbeitet werden sie inline im Studio
 * über `data-ek-global="<key>"`-Elemente — analog zu `data-ek-field` bei Blöcken.
 */

/** Serialisierbarer Feld-Deskriptor eines Globals (identische Form wie bei Blöcken). */
export type GlobalsFieldDescriptor = BlockFieldDescriptor;

export interface GlobalsDefinitionInput<Shape extends z.ZodRawShape = z.ZodRawShape> {
  schema: z.ZodObject<Shape>;
}

export interface GlobalsDefinition<Shape extends z.ZodRawShape = z.ZodRawShape>
  extends GlobalsDefinitionInput<Shape> {
  /** Serialisierbare Feldliste (geht per ek:globals an das Studio). */
  fields: GlobalsFieldDescriptor[];
}

/**
 * Definiert die Site-Globals eines Projekts. Validiert, dass jedes Feld ein
 * Editkraft-Primitive ist, und leitet die Feld-Deskriptoren für das Studio ab.
 */
export function defineGlobals<Shape extends z.ZodRawShape>(
  input: GlobalsDefinitionInput<Shape>,
): GlobalsDefinition<Shape> {
  const fields = deriveFieldDescriptors(input.schema.shape as z.ZodRawShape, "defineGlobals");
  return { ...input, fields };
}

/** Validiert Globals-Werte gegen die Definition. */
export function validateGlobals<Shape extends z.ZodRawShape>(
  definition: GlobalsDefinition<Shape>,
  values: unknown,
): z.infer<z.ZodObject<Shape>> {
  return definition.schema.parse(values);
}
