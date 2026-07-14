import { createElement, type ComponentType } from "react";
import {
  COLLECTION_BLOCK_PREFIX,
  type BlockDefinition,
  type BlockSchemaDescriptor,
  type CollectionDefinition,
} from "@editkraft/schema";
import { EditkraftError } from "./errors";

/** Props every block component receives: the validated block props + children. */
export type BlockComponentProps = Record<string, unknown> & {
  children?: React.ReactNode;
};

export interface RegistryEntry {
  definition: BlockDefinition;
  // Blocks have different prop types depending on their schema; the registry is
  // deliberately heterogeneous. Runtime validation is handled by the block schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
}

/**
 * Collection entry (Roadmap 2.8): pairs a `defineCollection` definition with
 * the item template. The template receives `{ item }` (the item's field
 * values) and marks editable elements with `data-ek-field` — exactly like a
 * block component does.
 */
export interface CollectionRegistryEntry {
  collection: CollectionDefinition;
  // Same deliberate heterogeneity as block components — the item shape is
  // validated at runtime against the collection's schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: ComponentType<any>;
}

/** What `createRegistry` accepts: block entries and/or collection entries. */
export type RegistryInput = RegistryEntry | CollectionRegistryEntry;

export interface Registry {
  get(type: string): RegistryEntry | undefined;
  has(type: string): boolean;
  types(): string[];
  descriptors(): BlockSchemaDescriptor[];
  /** Registered collection entry for a collection slug (e.g. "blog"). */
  getCollection(slug: string): CollectionRegistryEntry | undefined;
}

/**
 * Builds the block registry from definition+component pairs and checks for
 * completeness: every type needs a definition (with a schema) AND a component,
 * no duplicates. If anything is missing, it throws immediately (fail-fast at app start).
 *
 * Collection entries (`{ collection, template }`) are additionally registered
 * as a synthetic block under the type `"$collection:" + slug`. This is the
 * whole item-mode integration: the preview bridge resolves item blocks through
 * the SAME `get()` lookup as normal blocks (template render, contenteditable,
 * `fieldKindOf`, ek:schema descriptors) — no second code path. The synthetic
 * component adapts spread block props to the template's `{ item }` contract.
 */
export function createRegistry(entries: RegistryInput[]): Registry {
  const map = new Map<string, RegistryEntry>();
  const collections = new Map<string, CollectionRegistryEntry>();

  const registerBlock = (entry: RegistryEntry) => {
    if (!entry?.definition?.type) {
      throw new EditkraftError(
        "REGISTRY_INVALID",
        "Registry entry without a valid block definition (defineBlock).",
      );
    }
    const type = entry.definition.type;
    if (!entry.definition.schema) {
      throw new EditkraftError(
        "REGISTRY_INVALID",
        `Block "${type}": definition has no schema.`,
      );
    }
    if (typeof entry.component !== "function") {
      throw new EditkraftError(
        "REGISTRY_INVALID",
        `Block "${type}": no React component registered.`,
      );
    }
    if (map.has(type)) {
      throw new EditkraftError(
        "REGISTRY_INVALID",
        `Block type "${type}" is registered twice.`,
      );
    }
    map.set(type, entry);
  };

  const registerCollection = (entry: CollectionRegistryEntry) => {
    if (!entry?.collection?.slug || !entry.collection.schema) {
      throw new EditkraftError(
        "REGISTRY_INVALID",
        "Registry entry without a valid collection definition (defineCollection).",
      );
    }
    const slug = entry.collection.slug;
    if (typeof entry.template !== "function") {
      throw new EditkraftError(
        "REGISTRY_INVALID",
        `Collection "${slug}": no template component registered.`,
      );
    }
    if (collections.has(slug)) {
      throw new EditkraftError(
        "REGISTRY_INVALID",
        `Collection "${slug}" is registered twice.`,
      );
    }
    const type = COLLECTION_BLOCK_PREFIX + slug;
    if (map.has(type)) {
      throw new EditkraftError(
        "REGISTRY_INVALID",
        `Collection "${slug}": block type "${type}" is already registered.`,
      );
    }
    collections.set(slug, entry);

    // Adapter: block components get spread props, templates get `{ item }`.
    // `children` is stripped — item blocks never have slots.
    const Template = entry.template;
    const adapter = ({ children: _children, ...item }: BlockComponentProps) =>
      createElement(Template, { item });

    map.set(type, {
      definition: {
        type,
        label: entry.collection.name,
        slots: [],
        schema: entry.collection.schema,
        fields: entry.collection.fields,
      } as BlockDefinition,
      component: adapter,
    });
  };

  for (const entry of entries) {
    if (entry && "collection" in entry) {
      registerCollection(entry);
    } else {
      registerBlock(entry as RegistryEntry);
    }
  }

  return {
    get: (type) => map.get(type),
    has: (type) => map.has(type),
    types: () => [...map.keys()],
    descriptors: () =>
      [...map.values()].map((e) => ({
        type: e.definition.type,
        label: e.definition.label,
        slots: e.definition.slots,
        fields: e.definition.fields,
      })),
    getCollection: (slug) => collections.get(slug),
  };
}
