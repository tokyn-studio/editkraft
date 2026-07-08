import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineBlock, ekText } from "@editkraft/schema";
import { createRegistry } from "./registry";
import { EditkraftError } from "./errors";

function Comp() {
  return null;
}
const heroDef = defineBlock({
  type: "Hero",
  label: "Hero",
  schema: z.object({ headline: ekText() }),
});

describe("createRegistry", () => {
  it("baut eine Registry und findet registrierte Typen", () => {
    const reg = createRegistry([{ definition: heroDef, component: Comp }]);
    expect(reg.has("Hero")).toBe(true);
    expect(reg.get("Hero")?.component).toBe(Comp);
    expect(reg.types()).toEqual(["Hero"]);
  });

  it("wirft bei fehlender Komponente", () => {
    expect(() =>
      // @ts-expect-error absichtlich ungültig
      createRegistry([{ definition: heroDef }]),
    ).toThrowError(EditkraftError);
  });

  it("wirft bei doppeltem Typ", () => {
    expect(() =>
      createRegistry([
        { definition: heroDef, component: Comp },
        { definition: heroDef, component: Comp },
      ]),
    ).toThrowError(/doppelt/);
  });

  it("wirft bei Eintrag ohne Definition", () => {
    expect(() =>
      // @ts-expect-error absichtlich ungültig
      createRegistry([{ component: Comp }]),
    ).toThrowError(/Definition/);
  });

  it("descriptors() liefert serialisierbare Block-Deskriptoren", () => {
    const reg = createRegistry([{ definition: heroDef, component: Comp }]);
    const d = reg.descriptors();
    expect(d).toEqual([
      { type: "Hero", label: "Hero", slots: [], fields: heroDef.fields },
    ]);
    // vollständig serialisierbar (keine Funktionen)
    expect(() => JSON.stringify(d)).not.toThrow();
  });
});
