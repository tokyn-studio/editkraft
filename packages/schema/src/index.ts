// Public API des Contracts (@editkraft/schema).
// Alles hier Exportierte ist Teil des öffentlichen Contracts; Änderungen
// unterliegen der Breaking-Change-Regel (siehe docs/DECISIONS.md).

export {
  ekText,
  ekRichText,
  ekImage,
  ekLink,
  ekColor,
  ekList,
  ekReference,
  getFieldMeta,
  isEkField,
  ekImageValue,
  ekLinkValue,
  ekReferenceValue,
  type EkFieldKind,
  type EkFieldMeta,
  type EkImageValue,
  type EkLinkValue,
  type EkReferenceValue,
} from "./primitives";

export {
  blockSchema,
  pageContentSchema,
  emptyPageContent,
  defineBlock,
  validateBlockProps,
  type Block,
  type PageContent,
  type BlockDefinition,
  type BlockDefinitionInput,
  type BlockFieldDescriptor,
} from "./block";

export {
  SCHEMA_VERSION,
  satisfies,
  isCompatible,
  majorOf,
  migrateContent,
  registerMigration,
  _resetMigrations,
  type ContentMigration,
} from "./version";

export {
  pageStatusSchema,
  pageMetaSchema,
  ekPageRowSchema,
  ekPageVersionRowSchema,
  ekAssetRowSchema,
  EK_ASSETS_BUCKET,
  type PageStatus,
  type PageMeta,
  type EkPageRow,
  type EkPageVersionRow,
  type EkAssetRow,
} from "./rows";

export { createDraftToken, verifyDraftToken } from "./draft-token";

export {
  PROTOCOL_VERSION,
  PROTOCOL_CHANNEL,
  ekReadyMessage,
  ekSelectMessage,
  ekUpdateMessage,
  ekTreeMessage,
  ekSchemaMessage,
  ekMessage,
  parseMessage,
  createMessage,
  isAllowedOrigin,
  type EkReadyMessage,
  type EkSelectMessage,
  type EkUpdateMessage,
  type EkTreeMessage,
  type EkSchemaMessage,
  type EkMessage,
  type BlockSchemaDescriptor,
} from "./protocol";
