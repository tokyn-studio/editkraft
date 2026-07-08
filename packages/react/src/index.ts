// Public API des Renderers (@editkraft/react).

export { createRegistry, type Registry, type RegistryEntry, type BlockComponentProps } from "./registry";
export { renderBlocks, type RenderOptions } from "./render";
export { EditkraftPage, type EditkraftPageProps } from "./page";
export {
  loadPublishedPage,
  defaultSupportedRange,
  pageTag,
  type PublishedPage,
  type LoadOptions,
} from "./data";
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
};
