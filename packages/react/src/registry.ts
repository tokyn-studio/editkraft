import type { ComponentType } from "react";
import type { BlockDefinition, BlockSchemaDescriptor } from "@editkraft/schema";
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

export interface Registry {
  get(type: string): RegistryEntry | undefined;
  has(type: string): boolean;
  types(): string[];
  descriptors(): BlockSchemaDescriptor[];
}

/**
 * Builds the block registry from definition+component pairs and checks for
 * completeness: every type needs a definition (with a schema) AND a component,
 * no duplicates. If anything is missing, it throws immediately (fail-fast at app start).
 */
export function createRegistry(entries: RegistryEntry[]): Registry {
  const map = new Map<string, RegistryEntry>();

  for (const entry of entries) {
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
  };
}
