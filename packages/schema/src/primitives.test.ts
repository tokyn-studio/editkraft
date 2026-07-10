import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ekText,
  ekRichText,
  ekImage,
  ekLink,
  ekColor,
  ekList,
  ekReference,
  getFieldMeta,
  isEkField,
  ekImageValue,
  ekLinkValue,
} from "./primitives";

describe("Feld-Primitives: Metadaten", () => {
  it("ekText trägt kind text und Konfiguration", () => {
    expect(getFieldMeta(ekText({ label: "Titel", multiline: true }))).toEqual({
      kind: "text",
      label: "Titel",
      multiline: true,
    });
  });

  it("jedes Primitive setzt das erwartete kind", () => {
    expect(getFieldMeta(ekRichText())?.kind).toBe("richText");
    expect(getFieldMeta(ekImage())?.kind).toBe("image");
    expect(getFieldMeta(ekLink())?.kind).toBe("link");
    expect(getFieldMeta(ekColor())?.kind).toBe("color");
    expect(getFieldMeta(ekReference({ to: "ek_pages" }))?.kind).toBe("reference");
  });

  it("ekReference trägt das Ziel", () => {
    expect(getFieldMeta(ekReference({ to: "ek_pages", label: "Seite" }))).toMatchObject({
      kind: "reference",
      to: "ek_pages",
      label: "Seite",
    });
  });

  it("Metadaten überleben .optional() und .default()", () => {
    expect(getFieldMeta(ekText().optional())?.kind).toBe("text");
    expect(getFieldMeta(ekColor().default("#fff"))?.kind).toBe("color");
    expect(getFieldMeta(ekLink().nullable())?.kind).toBe("link");
  });

  it("isEkField erkennt Nicht-Primitives", () => {
    expect(isEkField(ekText())).toBe(true);
    expect(isEkField(z.string())).toBe(false);
  });
});

describe("Feld-Primitives: Validierung", () => {
  it("ekText validiert Strings", () => {
    expect(ekText().safeParse("hallo").success).toBe(true);
    expect(ekText().safeParse(123).success).toBe(false);
  });

  it("ekColor akzeptiert Hex und Token, lehnt Unsinn ab", () => {
    expect(ekColor().safeParse("#fff").success).toBe(true);
    expect(ekColor().safeParse("#ff8800").success).toBe(true);
    expect(ekColor().safeParse("brand-primary").success).toBe(true);
    expect(ekColor().safeParse("nicht farbe!").success).toBe(false);
  });

  it("ekImage validiert gegen ekImageValue", () => {
    const ok = ekImage().safeParse({ assetId: "a1", alt: "x", width: 800, height: 600 });
    expect(ok.success).toBe(true);
    expect(ekImage().safeParse({ alt: "ohne assetId" }).success).toBe(false);
    expect(ekImageValue.safeParse({ assetId: "a1" }).success).toBe(true);
  });

  it("ekLink verlangt href", () => {
    expect(ekLink().safeParse({ href: "/ueber-uns" }).success).toBe(true);
    expect(ekLink().safeParse({ label: "ohne href" }).success).toBe(false);
    expect(ekLinkValue.safeParse({ href: "https://x.de", external: true }).success).toBe(true);
  });

  it("ekList validiert eine Liste des Item-Typs und trägt Item-Metadaten", () => {
    const field = ekList(ekText(), { label: "Tags" });
    expect(field.safeParse(["a", "b"]).success).toBe(true);
    expect(field.safeParse([1, 2]).success).toBe(false);
    const meta = getFieldMeta(field);
    expect(meta).toMatchObject({ kind: "list", label: "Tags", item: { kind: "text" } });
  });

  it("ekList lehnt Nicht-Primitive-Items ab", () => {
    expect(() => ekList(z.string())).toThrowError(/Editkraft primitive/);
  });
});
