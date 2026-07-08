import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { z } from "zod";
import { defineBlock, ekText, createMessage, type PageContent } from "@editkraft/schema";
import { createRegistry } from "./registry";
import { EditkraftPreview } from "./preview";

const STUDIO = "https://studio.editkraft.test";

function Hero({ headline }: { headline: string }) {
  return <h1>{headline}</h1>;
}
function Text({ body }: { body: string }) {
  return <p>{body}</p>;
}
const registry = createRegistry([
  { definition: defineBlock({ type: "Hero", label: "Hero", schema: z.object({ headline: ekText() }) }), component: Hero },
  { definition: defineBlock({ type: "Text", label: "Text", schema: z.object({ body: ekText() }) }), component: Text },
]);

const content: PageContent = {
  schemaVersion: "0.1.0",
  blocks: [
    { id: "b1", type: "Hero", props: { headline: "Original" } },
    { id: "b2", type: "Text", props: { body: "Zweiter" } },
  ],
};

function dispatchFromStudio(message: unknown, origin = STUDIO) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data: message, origin }));
  });
}

afterEach(cleanup);

describe("EditkraftPreview (postMessage-Bridge)", () => {
  it("meldet ek:ready und ek:tree beim Mount ans Studio", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    const types = post.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain("ek:ready");
    expect(types).toContain("ek:tree");
    // Ziel-Origin ist die Studio-Origin, nicht "*"
    expect(post.mock.calls[0]![1]).toBe(STUDIO);
    post.mockRestore();
  });

  it("sendet ek:schema mit den Block-Deskriptoren beim Mount", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    const schema = post.mock.calls.map((c) => c[0] as { type: string; blocks?: unknown[] }).find((m) => m.type === "ek:schema");
    expect(schema).toBeTruthy();
    expect(schema!.blocks!.length).toBeGreaterThan(0);
    post.mockRestore();
  });

  it("ek:update aus dem Studio aktualisiert das Prop live im DOM", async () => {
    render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    expect(screen.getByText("Original")).toBeTruthy();

    dispatchFromStudio(createMessage("ek:update", { blockId: "b1", props: { headline: "Live geändert" } }));

    await waitFor(() => expect(screen.getByText("Live geändert")).toBeTruthy());
    expect(screen.queryByText("Original")).toBeNull();
  });

  it("ek:select markiert den Block", async () => {
    const { container } = render(
      <EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />,
    );
    dispatchFromStudio(createMessage("ek:select", { blockId: "b2" }));
    await waitFor(() =>
      expect(container.querySelector('[data-editkraft-block-id="b2"][data-editkraft-selected="true"]')).toBeTruthy(),
    );
  });

  it("Klick auf ein Overlay meldet ek:select ans Studio", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = render(
      <EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />,
    );
    post.mockClear();
    fireEvent.click(container.querySelector('[data-editkraft-block-id="b1"]')!);
    const select = post.mock.calls.map((c) => c[0] as { type: string; blockId?: string }).find((m) => m.type === "ek:select");
    expect(select?.blockId).toBe("b1");
    post.mockRestore();
  });

  it("ignoriert Nachrichten von fremder Origin", async () => {
    render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    dispatchFromStudio(
      createMessage("ek:update", { blockId: "b1", props: { headline: "Böse" } }),
      "https://evil.example",
    );
    // kurz warten, dann sicherstellen, dass nichts geändert wurde
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("Original")).toBeTruthy();
    expect(screen.queryByText("Böse")).toBeNull();
  });
});
