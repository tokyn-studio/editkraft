import { z } from "zod";
import { pageContentSchema, type BlockFieldDescriptor } from "./block";

/**
 * postMessage-Protokoll zwischen Preview (Kundenprojekt, `@editkraft/react`) und
 * dem umgebenden Studio-iframe. Der Contract definiert die Message-Typen; die
 * Studio-Seite implementiert das Nachbar-Repo.
 *
 * Richtung:
 *   preview → studio: ek:ready, ek:schema, ek:tree, ek:select, ek:focus-field
 *                     ek:update (Inline-Edit im Preview)
 *   studio → preview: ek:select (Selektion setzen), ek:update (Prop-Update)
 *
 * ek:select und ek:update sind bidirektional (beide Seiten senden/empfangen).
 *
 * Jede Nachricht trägt `channel: "editkraft"` und `v` (Protokollversion), damit
 * fremde postMessages sicher ignoriert werden. Zusätzlich MUSS der Empfänger die
 * Origin prüfen (isAllowedOrigin) – das Protokoll allein authentifiziert nicht.
 */

export const PROTOCOL_VERSION = 1;
export const PROTOCOL_CHANNEL = "editkraft";

const base = { channel: z.literal(PROTOCOL_CHANNEL), v: z.literal(PROTOCOL_VERSION) };

/** Preview ist geladen und bereit (nennt seine Contract-Version). */
export const ekReadyMessage = z.object({
  ...base,
  type: z.literal("ek:ready"),
  schemaVersion: z.string(),
});

/** Ein Block wurde selektiert (in beide Richtungen). */
export const ekSelectMessage = z.object({
  ...base,
  type: z.literal("ek:select"),
  blockId: z.string(),
});

/** Prop-Update für einen Block. Bidirektional: Studio setzt props (Live-Vorschau),
 *  die Preview meldet Inline-Edits mit derselben Payload zurück. */
export const ekUpdateMessage = z.object({
  ...base,
  type: z.literal("ek:update"),
  blockId: z.string(),
  props: z.record(z.string(), z.unknown()),
});

/** Preview meldet den aktuellen Blocktree ans Studio. */
export const ekTreeMessage = z.object({
  ...base,
  type: z.literal("ek:tree"),
  content: pageContentSchema,
});

export type BlockSchemaDescriptor = {
  type: string;
  label: string;
  slots: string[];
  fields: BlockFieldDescriptor[];
};

const blockFieldDescriptorSchema = z
  .object({
    kind: z.enum(["text", "richText", "image", "link", "color", "list", "reference"]),
    key: z.string(),
    optional: z.boolean(),
  })
  .passthrough(); // label, to, item etc. werden mitgeführt

const blockSchemaDescriptorSchema = z.object({
  type: z.string(),
  label: z.string(),
  slots: z.array(z.string()),
  fields: z.array(blockFieldDescriptorSchema),
});

/** Preview → Studio: verfügbare Blöcke samt Feld-Deskriptoren (für die Formulare). */
export const ekSchemaMessage = z.object({
  ...base,
  type: z.literal("ek:schema"),
  blocks: z.array(blockSchemaDescriptorSchema),
});
export type EkSchemaMessage = z.infer<typeof ekSchemaMessage>;

/** Preview → Studio: Nutzer ist in ein Feld gegangen (Inline-Klick / Bild-Klick). */
export const ekFocusFieldMessage = z.object({
  ...base,
  type: z.literal("ek:focus-field"),
  blockId: z.string(),
  fieldKey: z.string(),
});
export type EkFocusFieldMessage = z.infer<typeof ekFocusFieldMessage>;

export const ekMessage = z.discriminatedUnion("type", [
  ekReadyMessage,
  ekSelectMessage,
  ekUpdateMessage,
  ekTreeMessage,
  ekSchemaMessage,
  ekFocusFieldMessage,
]);

export type EkReadyMessage = z.infer<typeof ekReadyMessage>;
export type EkSelectMessage = z.infer<typeof ekSelectMessage>;
export type EkUpdateMessage = z.infer<typeof ekUpdateMessage>;
export type EkTreeMessage = z.infer<typeof ekTreeMessage>;
export type EkMessage = z.infer<typeof ekMessage>;

/**
 * Parst und validiert eingehende postMessage-Daten. Gibt die typisierte
 * Nachricht zurück oder null (unbekannt/fremd – niemals werfen, damit fremde
 * Messages die Bridge nicht stören).
 */
export function parseMessage(data: unknown): EkMessage | null {
  const result = ekMessage.safeParse(data);
  return result.success ? result.data : null;
}

/** Baut eine gültige Nachricht (setzt channel/v automatisch). */
export function createMessage<T extends EkMessage["type"]>(
  type: T,
  payload: Omit<Extract<EkMessage, { type: T }>, "type" | "channel" | "v">,
): Extract<EkMessage, { type: T }> {
  return {
    channel: PROTOCOL_CHANNEL,
    v: PROTOCOL_VERSION,
    type,
    ...payload,
  } as Extract<EkMessage, { type: T }>;
}

/**
 * Origin-Check für den Empfänger. `allowed` ist eine exakte Origin
 * (z. B. "https://studio.editkraft.dev") oder eine Liste davon; die erlaubte
 * Studio-Origin kommt aus der ENV des Kundenprojekts.
 */
export function isAllowedOrigin(origin: string, allowed: string | string[]): boolean {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  return list.includes(origin);
}
