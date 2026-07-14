import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineGlobals, validateGlobals } from "./globals";
import { ekText, ekRichText } from "./primitives";

describe("defineGlobals", () => {
  it("leitet Feld-Deskriptoren aus dem Zod-Schema ab", () => {
    const globals = defineGlobals({
      schema: z.object({
        phone: ekText({ label: "Telefon" }),
        claim: ekRichText({ label: "Claim" }).optional(),
      }),
    });
    expect(globals.fields).toEqual([
      { kind: "text", label: "Telefon", key: "phone", optional: false },
      { kind: "richText", label: "Claim", key: "claim", optional: true },
    ]);
  });

  it("wirft bei Feldern ohne Editkraft-Primitive", () => {
    expect(() =>
      defineGlobals({ schema: z.object({ phone: z.string() }) }),
    ).toThrowError(/defineGlobals: field "phone" does not use an Editkraft primitive/);
  });

  it("validateGlobals parst Werte gegen die Definition", () => {
    const globals = defineGlobals({
      schema: z.object({ phone: ekText({ label: "Telefon" }) }),
    });
    expect(validateGlobals(globals, { phone: "0176 1" })).toEqual({ phone: "0176 1" });
    expect(() => validateGlobals(globals, { phone: 42 })).toThrow();
  });
});
