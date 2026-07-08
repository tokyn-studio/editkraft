import type { ComponentType } from "react";
import type { BlockDefinition } from "@editkraft/schema";
import { EditkraftError } from "./errors";

/** Props, die jede Block-Komponente erhält: die validierten Block-Props + children. */
export type BlockComponentProps = Record<string, unknown> & {
  children?: React.ReactNode;
};

export interface RegistryEntry {
  definition: BlockDefinition;
  // Blöcke haben je nach Schema unterschiedliche Prop-Typen; die Registry ist
  // bewusst heterogen. Die Laufzeit-Validierung übernimmt das Block-Schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
}

export interface Registry {
  get(type: string): RegistryEntry | undefined;
  has(type: string): boolean;
  types(): string[];
}

/**
 * Baut die Block-Registry aus Definition+Komponente-Paaren und prüft auf
 * Vollständigkeit: jeder Typ braucht Definition (mit Schema) UND Komponente,
 * keine Duplikate. Fehlt etwas, wirft es sofort (Fail-fast beim App-Start).
 */
export function createRegistry(entries: RegistryEntry[]): Registry {
  const map = new Map<string, RegistryEntry>();

  for (const entry of entries) {
    if (!entry?.definition?.type) {
      throw new EditkraftError(
        "REGISTRY_INVALID",
        "Registry-Eintrag ohne gültige Block-Definition (defineBlock).",
      );
    }
    const type = entry.definition.type;
    if (!entry.definition.schema) {
      throw new EditkraftError(
        "REGISTRY_INVALID",
        `Block "${type}": Definition ohne Schema.`,
      );
    }
    if (typeof entry.component !== "function") {
      throw new EditkraftError(
        "REGISTRY_INVALID",
        `Block "${type}": keine React-Komponente registriert.`,
      );
    }
    if (map.has(type)) {
      throw new EditkraftError(
        "REGISTRY_INVALID",
        `Block-Typ "${type}" ist doppelt registriert.`,
      );
    }
    map.set(type, entry);
  }

  return {
    get: (type) => map.get(type),
    has: (type) => map.has(type),
    types: () => [...map.keys()],
  };
}
