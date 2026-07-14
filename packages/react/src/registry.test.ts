import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineBlock, defineCollection, ekRichText, ekText } from "@editkraft/schema";
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

function Template() {
  return null;
}
const blogDef = defineCollection({
  slug: "blog",
  name: "Blog",
  schema: z.object({ title: ekText({ label: "Titel" }), body: ekRichText() }),
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
    ).toThrowError(/registered twice/);
  });

  it("wirft bei Eintrag ohne Definition", () => {
    expect(() =>
      // @ts-expect-error absichtlich ungültig
      createRegistry([{ component: Comp }]),
    ).toThrowError(/definition/);
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

describe("createRegistry — Collections", () => {
  it("registriert Collection-Einträge und findet sie über getCollection(slug)", () => {
    const reg = createRegistry([
      { definition: heroDef, component: Comp },
      { collection: blogDef, template: Template },
    ]);
    expect(reg.getCollection("blog")?.template).toBe(Template);
    expect(reg.getCollection("blog")?.collection).toBe(blogDef);
    expect(reg.getCollection("unbekannt")).toBeUndefined();
    // Block-API bleibt unverändert nutzbar.
    expect(reg.get("Hero")?.component).toBe(Comp);
  });

  it("registriert den synthetischen Blocktyp \"$collection:<slug>\" für die Preview-Bridge", () => {
    const reg = createRegistry([{ collection: blogDef, template: Template }]);
    expect(reg.has("$collection:blog")).toBe(true);
    // Das Schema des synthetischen Blocks ist das Collection-Schema.
    const entry = reg.get("$collection:blog");
    expect(entry?.definition.schema.safeParse({ title: "x", body: "<p>y</p>" }).success).toBe(true);
    expect(entry?.definition.fields).toBe(blogDef.fields);
  });

  it("descriptors() enthält die Collection-Feld-Deskriptoren (für ek:schema)", () => {
    const reg = createRegistry([{ collection: blogDef, template: Template }]);
    expect(reg.descriptors()).toContainEqual({
      type: "$collection:blog",
      label: "Blog",
      slots: [],
      fields: blogDef.fields,
    });
    expect(() => JSON.stringify(reg.descriptors())).not.toThrow();
  });

  it("wirft bei fehlendem Template", () => {
    expect(() =>
      // @ts-expect-error absichtlich ungültig
      createRegistry([{ collection: blogDef }]),
    ).toThrowError(/no template component/);
  });

  it("wirft bei doppeltem Collection-Slug", () => {
    expect(() =>
      createRegistry([
        { collection: blogDef, template: Template },
        { collection: blogDef, template: Template },
      ]),
    ).toThrowError(/registered twice/);
  });

  it("wirft bei Kollision mit einem registrierten Blocktyp", () => {
    const collidingBlock = defineBlock({
      type: "$collection:blog",
      label: "Kollision",
      schema: z.object({ headline: ekText() }),
    });
    expect(() =>
      createRegistry([
        { definition: collidingBlock, component: Comp },
        { collection: blogDef, template: Template },
      ]),
    ).toThrowError(EditkraftError);
  });

  it("wirft bei Eintrag ohne gültige Collection-Definition", () => {
    expect(() =>
      // @ts-expect-error absichtlich ungültig
      createRegistry([{ collection: { name: "kaputt" }, template: Template }]),
    ).toThrowError(/defineCollection/);
  });
});
