/**
 * Renderer error types. All come with a clear course of action — never a
 * silent crash. `code` is stable for programmatic handling.
 */
export type EditkraftErrorCode =
  | "REGISTRY_INVALID"
  | "SCHEMA_INCOMPATIBLE"
  | "PAGE_NOT_FOUND"
  | "CONTENT_INVALID"
  | "SYMBOLS_UNSUPPORTED";

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
      `Content was written with @editkraft/schema ${writtenVersion}, ` +
        `but this renderer supports ${supportedRange}. ` +
        "Update @editkraft/react and @editkraft/schema in the project to matching " +
        "versions (same major) or migrate the content in the Studio.",
    );
    this.name = "EditkraftSchemaError";
  }
}
