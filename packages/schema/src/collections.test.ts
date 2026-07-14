import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  COLLECTION_BLOCK_PREFIX,
  collectionSlugOfBlockType,
  defineCollection,
  isCollectionBlockType,
  itemToBlock,
  validateItemData,
} from "./collections";
import { blockSchema } from "./block";
import { ekImage, ekRichText, ekText } from "./primitives";

const blog = defineCollection({
  slug: "blog",
  name: "Blog",
  schema: z.object({
    title: ekText({ label: "Titel" }),
    cover: ekImage({ label: "Cover" }).optional(),
    body: ekRichText({ label: "Body" }),
  }),
});

describe("defineCollection", () => {
  it("leitet die serialisierbaren Feld-Deskriptoren aus dem Zod-Schema ab", () => {
    expect(blog.slug).toBe("blog");
    expect(blog.name).toBe("Blog");
    expect(blog.fields).toEqual([
      { kind: "text", label: "Titel", key: "title", optional: false },
      { kind: "image", label: "Cover", key: "cover", optional: true },
      { kind: "richText", label: "Body", key: "body", optional: false },
    ]);
    // vollständig serialisierbar (landet als item_schema in der DB)
    expect(() => JSON.stringify(blog.fields)).not.toThrow();
  });

  it("wirft bei Feldern ohne Editkraft-Primitive", () => {
    expect(() =>
      defineCollection({
        slug: "blog",
        name: "Blog",
        schema: z.object({ title: z.string() }),
      }),
    ).toThrowError(/defineCollection\("blog"\): field "title" does not use an Editkraft primitive/);
  });

  it("wirft bei einem Schema ohne Felder", () => {
    expect(() =>
      defineCollection({ slug: "blog", name: "Blog", schema: z.object({}) }),
    ).toThrowError(/at least one field/);
  });

  it("wirft bei fehlendem oder nicht URL-tauglichem Slug", () => {
    expect(() =>
      defineCollection({
        slug: "",
        name: "Blog",
        schema: z.object({ title: ekText() }),
      }),
    ).toThrowError(/slug is required/);
    expect(() =>
      defineCollection({
        slug: "Mein Blog",
        name: "Blog",
        schema: z.object({ title: ekText() }),
      }),
    ).toThrowError(/URL-safe slug/);
  });

  it("wirft bei fehlendem Namen", () => {
    expect(() =>
      defineCollection({
        slug: "blog",
        name: "",
        schema: z.object({ title: ekText() }),
      }),
    ).toThrowError(/name is required/);
  });

  it("erlaubt mehrere richText-Felder (Konvention, kein Zwang)", () => {
    const c = defineCollection({
      slug: "docs",
      name: "Docs",
      schema: z.object({ intro: ekRichText(), body: ekRichText() }),
    });
    expect(c.fields.filter((f) => f.kind === "richText")).toHaveLength(2);
  });
});

describe("validateItemData", () => {
  it("parst gültige Feldwerte gegen das Zod-Objekt", () => {
    const data = { title: "Hallo", body: "<p>Welt</p>" };
    expect(validateItemData(blog, data)).toEqual(data);
  });

  it("wirft bei ungültigen Feldwerten", () => {
    expect(() => validateItemData(blog, { title: 42, body: "<p>x</p>" })).toThrow();
    expect(() => validateItemData(blog, { title: "ohne Body" })).toThrow();
  });
});

describe("itemToBlock (Roundtrip)", () => {
  const data = { title: "Hallo", body: "<p>Welt</p>" };
  const block = itemToBlock("blog", "item-1", data);

  it("baut den synthetischen Ein-Block mit id/type/props", () => {
    expect(block).toEqual({
      id: "item-1",
      type: "$collection:blog",
      props: data,
    });
  });

  it("der Block ist ein gültiger Wire-Format-Knoten (blockSchema)", () => {
    expect(blockSchema.safeParse(block).success).toBe(true);
  });

  it("Roundtrip: props validieren gegen die Definition, Slug ist rekonstruierbar", () => {
    expect(validateItemData(blog, block.props)).toEqual(data);
    expect(isCollectionBlockType(block.type)).toBe(true);
    expect(collectionSlugOfBlockType(block.type)).toBe("blog");
  });
});

describe("isCollectionBlockType", () => {
  it("erkennt synthetische Collection-Typen", () => {
    expect(isCollectionBlockType("$collection:blog")).toBe(true);
    expect(isCollectionBlockType(`${COLLECTION_BLOCK_PREFIX}team-members`)).toBe(true);
  });

  it("grenzt gegen $symbol, normale Blöcke und leeren Slug ab", () => {
    expect(isCollectionBlockType("$symbol")).toBe(false);
    expect(isCollectionBlockType("Hero")).toBe(false);
    expect(isCollectionBlockType("$collection:")).toBe(false);
    expect(isCollectionBlockType("")).toBe(false);
    expect(collectionSlugOfBlockType("$symbol")).toBeNull();
  });
});
