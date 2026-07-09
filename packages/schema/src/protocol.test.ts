import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  PROTOCOL_CHANNEL,
  parseMessage,
  createMessage,
  isAllowedOrigin,
  ekMessage,
  ekFocusFieldMessage,
  type BlockSchemaDescriptor,
} from "./protocol";

describe("postMessage-Protokoll", () => {
  it("createMessage setzt channel und Version automatisch", () => {
    const msg = createMessage("ek:select", { blockId: "b1" });
    expect(msg).toEqual({
      channel: PROTOCOL_CHANNEL,
      v: PROTOCOL_VERSION,
      type: "ek:select",
      blockId: "b1",
    });
  });

  it("alle vier Message-Typen sind gültig", () => {
    expect(ekMessage.safeParse(createMessage("ek:ready", { schemaVersion: "0.1.0" })).success).toBe(
      true,
    );
    expect(ekMessage.safeParse(createMessage("ek:select", { blockId: "b" })).success).toBe(true);
    expect(
      ekMessage.safeParse(createMessage("ek:update", { blockId: "b", props: { x: 1 } })).success,
    ).toBe(true);
    expect(
      ekMessage.safeParse(
        createMessage("ek:tree", { content: { schemaVersion: "0.1.0", blocks: [] } }),
      ).success,
    ).toBe(true);
  });

  it("parseMessage gibt typisierte Nachricht zurück", () => {
    const parsed = parseMessage(createMessage("ek:update", { blockId: "b", props: { a: 1 } }));
    expect(parsed?.type).toBe("ek:update");
  });

  it("parseMessage ignoriert fremde/ungültige Daten (null statt Fehler)", () => {
    expect(parseMessage({ type: "something-else" })).toBeNull();
    expect(parseMessage({ channel: "andere-app", type: "ek:select", blockId: "b" })).toBeNull();
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage("string")).toBeNull();
  });

  it("falsche Protokollversion wird abgelehnt", () => {
    expect(
      parseMessage({ channel: PROTOCOL_CHANNEL, v: 99, type: "ek:select", blockId: "b" }),
    ).toBeNull();
  });

  it("isAllowedOrigin prüft exakt gegen Einzelwert und Liste", () => {
    expect(isAllowedOrigin("https://studio.editkraft.dev", "https://studio.editkraft.dev")).toBe(
      true,
    );
    expect(isAllowedOrigin("https://evil.example", "https://studio.editkraft.dev")).toBe(false);
    expect(
      isAllowedOrigin("https://a.dev", ["https://a.dev", "http://localhost:3000"]),
    ).toBe(true);
  });
});

describe("ek:schema", () => {
  const blocks: BlockSchemaDescriptor[] = [
    { type: "Hero", label: "Hero", slots: [], fields: [{ kind: "text", key: "headline", optional: false }] },
  ];

  it("ist ein gültiger Message-Typ", () => {
    const msg = createMessage("ek:schema", { blocks });
    expect(ekMessage.safeParse(msg).success).toBe(true);
    expect(parseMessage(msg)?.type).toBe("ek:schema");
  });

  it("verlangt type/label/slots/fields je Block", () => {
    const bad = createMessage("ek:schema", { blocks: [{ type: "X" }] as never });
    expect(ekMessage.safeParse(bad).success).toBe(false);
  });
});

describe("ek:focus-field", () => {
  it("createMessage baut eine gültige focus-field-Nachricht", () => {
    const msg = createMessage("ek:focus-field", { blockId: "b1", fieldKey: "headline" });
    expect(msg).toEqual({
      channel: "editkraft",
      v: 1,
      type: "ek:focus-field",
      blockId: "b1",
      fieldKey: "headline",
    });
  });

  it("parseMessage akzeptiert focus-field und liefert die Felder typisiert", () => {
    const parsed = parseMessage(createMessage("ek:focus-field", { blockId: "b2", fieldKey: "body" }));
    expect(parsed?.type).toBe("ek:focus-field");
    expect(parsed && parsed.type === "ek:focus-field" ? parsed.fieldKey : null).toBe("body");
  });

  it("das direkte Schema lehnt eine focus-field-Nachricht ohne fieldKey ab", () => {
    expect(ekFocusFieldMessage.safeParse({ channel: "editkraft", v: 1, type: "ek:focus-field", blockId: "b1" }).success).toBe(false);
  });
});
