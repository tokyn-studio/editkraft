/**
 * Fehlertypen des Renderers. Alle mit klarer Handlungsanweisung – nie stiller
 * Crash. `code` ist stabil für programmatische Behandlung.
 */
export type EditkraftErrorCode =
  | "REGISTRY_INVALID"
  | "SCHEMA_INCOMPATIBLE"
  | "PAGE_NOT_FOUND"
  | "CONTENT_INVALID";

export class EditkraftError extends Error {
  constructor(
    public readonly code: EditkraftErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EditkraftError";
  }
}

export class EditkraftSchemaError extends EditkraftError {
  constructor(
    public readonly writtenVersion: string,
    public readonly supportedRange: string,
  ) {
    super(
      "SCHEMA_INCOMPATIBLE",
      `Der Content wurde mit @editkraft/schema ${writtenVersion} geschrieben, ` +
        `dieser Renderer unterstützt aber ${supportedRange}. ` +
        "Aktualisiere @editkraft/react und @editkraft/schema im Projekt auf zueinander " +
        "passende Versionen (gleiche Major) oder migriere den Content im Studio.",
    );
    this.name = "EditkraftSchemaError";
  }
}
