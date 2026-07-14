// Public API des Contracts (@editkraft/schema).
// Alles hier Exportierte ist Teil des öffentlichen Contracts; Änderungen
// unterliegen der Breaking-Change-Regel (siehe docs/DECISIONS.md).

export {
  ekText,
  ekRichText,
  ekImage,
  ekLink,
  ekColor,
  ekSelect,
  ekList,
  ekReference,
  getFieldMeta,
  isEkField,
  ekImageValue,
  ekImageFrame,
  DEFAULT_IMAGE_FRAME,
  imageFrameStyles,
  ekLinkValue,
  ekReferenceValue,
  type EkFieldKind,
  type EkFieldMeta,
  type EkSelectOption,
  type EkImageValue,
  type EkImageFrame,
  type EkLinkValue,
  type EkReferenceValue,
} from "./primitives";

export {
  blockSchema,
  symbolRefSchema,
  isSymbolRef,
  type SymbolRef,
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
  COLLECTION_BLOCK_PREFIX,
  collectionSlugOfBlockType,
  defineCollection,
  isCollectionBlockType,
  itemToBlock,
  validateItemData,
  type CollectionDefinition,
  type CollectionDefinitionInput,
  type CollectionFieldDescriptor,
} from "./collections";

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
  defineGlobals,
  validateGlobals,
  type GlobalsDefinition,
  type GlobalsDefinitionInput,
  type GlobalsFieldDescriptor,
} from "./globals";

export {
  pageStatusSchema,
  pageMetaSchema,
  ekPageRowSchema,
  ekPageVersionRowSchema,
  ekAssetRowSchema,
  ekGlobalsRowSchema,
  EK_ASSETS_BUCKET,
  type PageStatus,
  type PageMeta,
  type EkPageRow,
  type EkPageVersionRow,
  type EkAssetRow,
  type EkGlobalsRow,
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
  ekFocusFieldMessage,
  ekGlobalsMessage,
  ekGlobalUpdateMessage,
  ekMessage,
  parseMessage,
  createMessage,
  isAllowedOrigin,
  type EkReadyMessage,
  type EkSelectMessage,
  type EkUpdateMessage,
  type EkTreeMessage,
  type EkSchemaMessage,
  type EkFocusFieldMessage,
  type EkGlobalsMessage,
  type EkGlobalUpdateMessage,
  type EkMessage,
  type BlockSchemaDescriptor,
} from "./protocol";

export { RICH_TEXT_ALLOWLIST, sanitizeRichText } from "./rich-text";

export {
  initMigration,
  i18nMigration,
  globalsMigration,
  symbolsMigration,
  collectionsMigration,
  ekMigrations,
  EK_MIGRATIONS,
  type EkMigration,
} from "./migrations";
