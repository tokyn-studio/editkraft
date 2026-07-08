import { describe, expect, it } from "vitest";
import type { PageContent } from "@editkraft/schema";
import { updateBlockProps, findBlock } from "./tree";

const content: PageContent = {
  schemaVersion: "0.1.0",
  blocks: [
    { id: "a", type: "Hero", props: { headline: "Alt" } },
    {
      id: "b",
      type: "Section",
      props: {},
      children: [{ id: "c", type: "Text", props: { body: "Innen" } }],
    },
  ],
};

describe("updateBlockProps", () => {
  it("merged Props des Zielblocks (immutable)", () => {
    const next = updateBlockProps(content, "a", { headline: "Neu" });
    expect(next.blocks[0]!.props).toEqual({ headline: "Neu" });
    expect(content.blocks[0]!.props).toEqual({ headline: "Alt" }); // Original unverändert
  });

  it("aktualisiert auch verschachtelte Blöcke", () => {
    const next = updateBlockProps(content, "c", { body: "Geändert" });
    expect(next.blocks[1]!.children![0]!.props).toEqual({ body: "Geändert" });
  });

  it("lässt den Tree unverändert, wenn die id fehlt", () => {
    expect(updateBlockProps(content, "gibtsnicht", { x: 1 })).toEqual(content);
  });
});

describe("findBlock", () => {
  it("findet Top-Level- und verschachtelte Blöcke", () => {
    expect(findBlock(content, "a")?.type).toBe("Hero");
    expect(findBlock(content, "c")?.type).toBe("Text");
    expect(findBlock(content, "weg")).toBeNull();
  });
});
