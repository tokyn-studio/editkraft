import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  defineBlock,
  validateBlockProps,
  blockSchema,
  pageContentSchema,
  emptyPageContent,
  type Block,
  isSymbolRef,
} from "./block";
import { ekText, ekImage, ekLink } from "./primitives";
import { SCHEMA_VERSION } from "./version";

const hero = defineBlock({
  type: "Hero",
  label: "Hero-Bereich",
  schema: z.object({
    headline: ekText({ label: "Überschrift" }),
    image: ekImage({ label: "Bild" }),
    cta: ekLink({ label: "Button" }).optional(),
  }),
});

describe("defineBlock", () => {
  it("leitet serialisierbare Feldbeschreibungen ab", () => {
    expect(hero.type).toBe("Hero");
    expect(hero.label).toBe("Hero-Bereich");
    expect(hero.slots).toEqual([]);
    const byKey = Object.fromEntries(hero.fields.map((f) => [f.key, f]));
    expect(byKey.headline).toMatchObject({ kind: "text", label: "Überschrift", optional: false });
    expect(byKey.image?.kind).toBe("image");
    expect(byKey.cta).toMatchObject({ kind: "link", optional: true });
  });

  it("übernimmt deklarierte Slots", () => {
    const cols = defineBlock({
      type: "Columns",
      label: "Spalten",
      slots: ["columns"],
      schema: z.object({ gap: ekText() }),
    });
    expect(cols.slots).toEqual(["columns"]);
  });

  it("wirft, wenn ein Feld kein Primitive ist", () => {
    expect(() =>
      defineBlock({ type: "Bad", label: "Bad", schema: z.object({ x: z.string() }) }),
    ).toThrowError(/does not use an Editkraft primitive/);
  });

  it("verlangt type und label", () => {
    expect(() =>
      defineBlock({ type: "", label: "X", schema: z.object({}) }),
    ).toThrowError(/type/);
    expect(() =>
      defineBlock({ type: "X", label: "", schema: z.object({}) }),
    ).toThrowError(/label/);
  });
});

describe("validateBlockProps", () => {
  it("validiert korrekte props", () => {
    const props = validateBlockProps(hero, {
      headline: "Willkommen",
      image: { assetId: "a1" },
    });
    expect(props.headline).toBe("Willkommen");
  });

  it("lehnt fehlende Pflichtfelder ab", () => {
    expect(() => validateBlockProps(hero, { headline: "x" })).toThrow();
  });
});

describe("blockSchema / pageContentSchema", () => {
  it("validiert einen verschachtelten Blocktree", () => {
    const tree: Block = {
      id: "b1",
      type: "Columns",
      props: {},
      children: [{ id: "b2", type: "Hero", props: { headline: "x" } }],
    };
    expect(blockSchema.safeParse(tree).success).toBe(true);
  });

  it("lehnt Blöcke ohne id/type ab", () => {
    expect(blockSchema.safeParse({ id: "", type: "X", props: {} }).success).toBe(false);
    expect(blockSchema.safeParse({ id: "b", type: "", props: {} }).success).toBe(false);
  });

  it("emptyPageContent trägt die aktuelle Schema-Version", () => {
    const c = emptyPageContent();
    expect(c).toEqual({ schemaVersion: SCHEMA_VERSION, blocks: [] });
    expect(pageContentSchema.safeParse(c).success).toBe(true);
  });
});

describe("symbolRefSchema (V2-Contract-Vorbereitung, Roadmap 2.4)", () => {
  it("akzeptiert Symbol-Knoten im Blocktree (Wire-Format)", () => {
    const tree = {
      schemaVersion: "0.1.0",
      blocks: [
        { id: "b1", type: "Hero", props: { headline: "x" } },
        { id: "s1", type: "$symbol", symbolId: "sym-123" },
      ],
    };
    expect(pageContentSchema.safeParse(tree).success).toBe(true);
  });

  it("verwirft Symbol-Knoten ohne symbolId", () => {
    const tree = {
      schemaVersion: "0.1.0",
      blocks: [{ id: "s1", type: "$symbol" }],
    };
    expect(pageContentSchema.safeParse(tree).success).toBe(false);
  });

  it("isSymbolRef erkennt nur $symbol-Knoten", () => {
    expect(isSymbolRef({ id: "s1", type: "$symbol", symbolId: "x" })).toBe(true);
    expect(isSymbolRef({ id: "b1", type: "Hero", props: {} })).toBe(false);
    expect(isSymbolRef(null)).toBe(false);
  });
});
