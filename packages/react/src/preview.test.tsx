import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { z } from "zod";
import { defineBlock, ekText, ekRichText, ekImage, createMessage, type PageContent } from "@editkraft/schema";
import { createRegistry } from "./registry";
import { EditkraftPreview } from "./preview";

const STUDIO = "https://studio.editkraft.test";

function Hero({ headline }: { headline: string }) {
  return <h1 data-ek-field="headline">{headline}</h1>;
}
function Text({ body }: { body: string }) {
  return <p data-ek-field="body">{body}</p>;
}
function Prose({ body }: { body: string }) {
  return <div data-ek-field="body" dangerouslySetInnerHTML={{ __html: body }} />;
}
function Banner({ image }: { image: { url?: string; alt?: string } }) {
  return <div data-ek-field="image"><img src={image?.url ?? ""} alt={image?.alt ?? ""} /></div>;
}
const registry = createRegistry([
  { definition: defineBlock({ type: "Hero", label: "Hero", schema: z.object({ headline: ekText() }) }), component: Hero },
  { definition: defineBlock({ type: "Text", label: "Text", schema: z.object({ body: ekText() }) }), component: Text },
  { definition: defineBlock({ type: "Prose", label: "Prosa", schema: z.object({ body: ekRichText() }) }), component: Prose },
  { definition: defineBlock({ type: "Banner", label: "Banner", schema: z.object({ image: ekImage() }) }), component: Banner },
]);

const content: PageContent = {
  schemaVersion: "0.1.0",
  blocks: [
    { id: "b1", type: "Hero", props: { headline: "Original" } },
    { id: "b2", type: "Text", props: { body: "Zweiter" } },
    { id: "b3", type: "Prose", props: { body: "<strong>fett</strong> normal" } },
    { id: "b4", type: "Banner", props: { image: { assetId: "", url: "" } } },
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

function fieldEl(container: HTMLElement, blockId: string, key: string): HTMLElement {
  return container.querySelector(
    `[data-editkraft-block-id="${blockId}"] [data-ek-field="${key}"]`,
  ) as HTMLElement;
}

describe("Inline-Editing", () => {
  it("macht text-Felder contentEditable", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    expect(fieldEl(container, "b1", "headline").getAttribute("contenteditable")).toBe("true");
  });

  it("Tippen im Feld sendet ek:update an das Studio", async () => {
    vi.useFakeTimers();
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    const el = fieldEl(container, "b1", "headline");
    post.mockClear();
    act(() => {
      el.focus();
      el.textContent = "Neu getippt";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      vi.advanceTimersByTime(400);
    });
    const upd = post.mock.calls.map((c) => c[0] as { type: string; blockId?: string; props?: Record<string, unknown> }).find((x) => x.type === "ek:update");
    expect(upd?.blockId).toBe("b1");
    expect(upd?.props?.headline).toBe("Neu getippt");
    post.mockRestore();
    vi.useRealTimers();
  });

  it("Fokus in ein Feld meldet ek:focus-field", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    post.mockClear();
    act(() => fieldEl(container, "b1", "headline").dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    const focus = post.mock.calls.map((c) => c[0] as { type: string; fieldKey?: string }).find((x) => x.type === "ek:focus-field");
    expect(focus?.fieldKey).toBe("headline");
    post.mockRestore();
  });

  it("Echo-Guard: eingehendes ek:update überschreibt das fokussierte Feld nicht", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    const el = fieldEl(container, "b1", "headline");
    act(() => {
      el.focus();
      el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      el.textContent = "Vom Nutzer getippt";
    });
    dispatchFromStudio(createMessage("ek:update", { blockId: "b1", props: { headline: "Echo vom Studio" } }));
    expect(fieldEl(container, "b1", "headline").textContent).toBe("Vom Nutzer getippt");
  });
});

describe("RichText-Mini-Toolbar", () => {
  it("erscheint bei nicht-leerer Selektion in einem richText-Feld", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    const el = fieldEl(container, "b3", "body");
    act(() => {
      el.focus();
      el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(container.querySelector('[data-editkraft-toolbar]')).toBeTruthy();
  });

  it("bleibt bei leerer/kollabierter Selektion verborgen", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    act(() => {
      window.getSelection()?.removeAllRanges();
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(container.querySelector('[data-editkraft-toolbar]')).toBeNull();
  });

  it("Klick auf einen Toolbar-Button meldet ek:update für das fokussierte richText-Feld", () => {
    vi.useFakeTimers();
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    const el = fieldEl(container, "b3", "body");
    act(() => {
      el.focus();
      el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(container.querySelector('[data-editkraft-toolbar]')).toBeTruthy();

    const post = vi.spyOn(window.parent, "postMessage");
    post.mockClear();
    const button = container.querySelector('[data-editkraft-toolbar] button') as HTMLElement;
    expect(button).toBeTruthy();
    act(() => {
      fireEvent.click(button);
      vi.advanceTimersByTime(400);
    });
    const upd = post.mock.calls
      .map((c) => c[0] as { type: string; blockId?: string; props?: Record<string, unknown> })
      .find((x) => x.type === "ek:update");
    expect(upd?.blockId).toBe("b3");
    post.mockRestore();
    vi.useRealTimers();
  });
});

describe("Bild-Feld", () => {
  it("ist nicht contentEditable", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    expect(fieldEl(container, "b4", "image").getAttribute("contenteditable")).toBeNull();
  });

  it("Klick meldet ek:focus-field mit dem Bildfeld", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    post.mockClear();
    fireEvent.click(fieldEl(container, "b4", "image"));
    const focus = post.mock.calls.map((c) => c[0] as { type: string; fieldKey?: string; blockId?: string }).find((x) => x.type === "ek:focus-field");
    expect(focus?.blockId).toBe("b4");
    expect(focus?.fieldKey).toBe("image");
    post.mockRestore();
  });

  it("Klick auf ein Bildfeld meldet genau EIN ek:select gefolgt von ek:focus-field, kein zweites ek:select danach", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    post.mockClear();
    fireEvent.click(fieldEl(container, "b4", "image"));

    const messages = post.mock.calls.map((c) => c[0] as { type: string; blockId?: string; fieldKey?: string });
    const selectMessages = messages.filter((m) => m.type === "ek:select");
    const focusMessages = messages.filter((m) => m.type === "ek:focus-field");

    // Genau ein ek:select (kein redundantes zweites vom Block-Wrapper-onClick).
    expect(selectMessages.length).toBe(1);
    expect(selectMessages[0]?.blockId).toBe("b4");

    // Genau ein ek:focus-field mit dem richtigen Block/Feld.
    expect(focusMessages.length).toBe(1);
    expect(focusMessages[0]?.blockId).toBe("b4");
    expect(focusMessages[0]?.fieldKey).toBe("image");

    // Reihenfolge: ek:select, dann ek:focus-field – kein weiteres ek:select danach.
    expect(messages.map((m) => m.type)).toEqual(["ek:select", "ek:focus-field"]);

    post.mockRestore();
  });

  it("Klick auf 'Library' im Bild-Popover meldet genau ein ek:library-open mit blockId/fieldKey", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    fireEvent.click(fieldEl(container, "b4", "image"));
    post.mockClear();

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-editkraft-image-popover] button"),
    );
    const libraryButton = buttons.find((b) => b.textContent?.includes("Library"));
    expect(libraryButton).toBeTruthy();
    fireEvent.click(libraryButton!);

    const messages = post.mock.calls.map(
      (c) => c[0] as { channel?: string; type: string; blockId?: string; fieldKey?: string },
    );
    const libraryMessages = messages.filter((m) => m.type === "ek:library-open");
    // Protokoll-Konsistenz: alle Raw-Messages tragen v:1 wie ihre Geschwister.
    expect(libraryMessages[0]?.v).toBe(1);

    expect(libraryMessages.length).toBe(1);
    expect(libraryMessages[0]?.channel).toBe("editkraft");
    expect(libraryMessages[0]?.blockId).toBe("b4");
    expect(libraryMessages[0]?.fieldKey).toBe("image");
    expect(post.mock.calls[0]![1]).toBe(STUDIO);

    post.mockRestore();
  });
});
