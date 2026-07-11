// Public API des Renderers (@editkraft/react).

export { createRegistry, type Registry, type RegistryEntry, type BlockComponentProps } from "./registry";
export { renderBlocks, type RenderOptions } from "./render";
export { EditkraftPage, type EditkraftPageProps } from "./page";
export {
  loadPublishedPage,
  loadDraftContent,
  defaultSupportedRange,
  pageTag,
  getAlternateLocales,
  getSitemapEntries,
  type PublishedPage,
  type LoadOptions,
  type DraftLoadOptions,
} from "./data";
export { updateBlockProps, findBlock } from "./tree";
// EditkraftPreview ist eine Client-Komponente und wird über den Subpath
// "@editkraft/react/preview" importiert (eigenes "use client"-Bundle).
export type { EditkraftPreviewProps } from "./preview";
export { createRevalidateHandler, type RevalidateHandlerOptions } from "./revalidate";
export {
  EditkraftError,
  EditkraftSchemaError,
  type EditkraftErrorCode,
} from "./errors";

// Preview-Bridge folgt in Meilenstein 4 (EditkraftPreview).
export type EditkraftConfig = {
  registry: string;
  studioOrigin: string;
  /** BCP-47 locales this site publishes. First entry pages are created in by default. */
  locales?: string[];
  /** Locale used when none is specified. Should be one of `locales`. */
  defaultLocale?: string;
};
