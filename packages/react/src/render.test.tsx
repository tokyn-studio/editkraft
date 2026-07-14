import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";
import { defineBlock, ekRichText, ekText, type Block } from "@editkraft/schema";
import { createRegistry } from "./registry";
import { renderBlocks } from "./render";

function Heading({ headline }: { headline: string }) {
  return <h1>{headline}</h1>;
}
function Section({ children }: { children?: React.ReactNode }) {
  return <section>{children}</section>;
}
/** Simuliert einen nachlässigen Block-Autor: kein eigener sanitizeRichText-Aufruf. */
function CarelessRichText({ body }: { body: string }) {
  return <div dangerouslySetInnerHTML={{ __html: body }} />;
}

const registry = createRegistry([
  {
    definition: defineBlock({ type: "Heading", label: "Überschrift", schema: z.object({ headline: ekText() }) }),
    component: Heading,
  },
  {
    definition: defineBlock({ type: "Section", label: "Sektion", slots: ["children"], schema: z.object({}) }),
    component: Section,
  },
  {
    definition: defineBlock({
      type: "CarelessRichText",
      label: "Nachlässiger RichText-Block",
      schema: z.object({ body: ekRichText() }),
    }),
    component: CarelessRichText,
  },
]);

const html = (blocks: Block[], dev = false) =>
  renderToStaticMarkup(renderBlocks(blocks, registry, { dev }));

afterEach(() => vi.restoreAllMocks());

describe("renderBlocks", () => {
  it("rendert bekannte Blöcke", () => {
    expect(html([{ id: "1", type: "Heading", props: { headline: "Hallo" } }])).toBe(
      "<h1>Hallo</h1>",
    );
  });

  it("rendert verschachtelte children über Slots", () => {
    const out = html([
      {
        id: "s",
        type: "Section",
        props: {},
        children: [{ id: "h", type: "Heading", props: { headline: "Innen" } }],
      },
    ]);
    expect(out).toBe("<section><h1>Innen</h1></section>");
  });

  it("unbekannter Typ: Production → console.warn + übersprungen", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = html([{ id: "x", type: "Gibtsnicht", props: {} }], false);
    expect(out).toBe("");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("unbekannter Typ: Dev → sichtbarer Platzhalter", () => {
    const out = html([{ id: "x", type: "Gibtsnicht", props: {} }], true);
    expect(out).toContain("data-editkraft-placeholder");
    expect(out).toContain("Gibtsnicht");
  });

  it("ungültige Props: Production → übersprungen, Dev → Platzhalter", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad: Block[] = [{ id: "b", type: "Heading", props: { headline: 123 } }];
    expect(html(bad, false)).toBe("");
    expect(html(bad, true)).toContain("Invalid props");
  });

  it("sanitisiert richText-Props zentral, auch wenn die Komponente selbst nicht sanitisiert", () => {
    const out = html([
      {
        id: "r",
        type: "CarelessRichText",
        props: { body: "<script>alert(1)</script><b>fett</b>" },
      },
    ]);
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<strong>fett</strong>");
  });
});

describe("$symbol-Knoten (V2-Contract, Roadmap 2.4)", () => {
  it("wirft SYMBOLS_UNSUPPORTED statt still zu skippen", () => {
    const symbolNode = { id: "s1", type: "$symbol", symbolId: "sym-1" } as unknown as Block;
    expect(() => renderBlocks([symbolNode], registry)).toThrowError(
      expect.objectContaining({ code: "SYMBOLS_UNSUPPORTED" }),
    );
  });
});
