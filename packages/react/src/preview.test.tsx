import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { z } from "zod";
import {
  createMessage,
  defineBlock,
  defineCollection,
  defineGlobals,
  ekImage,
  ekLink,
  ekRichText,
  ekSelect,
  ekText,
  itemToBlock,
  type PageContent,
} from "@editkraft/schema";
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
function Icon({ icon }: { icon: string }) {
  return <span data-ek-field="icon">{icon}</span>;
}
// CTA-Button: data-ek-field sitzt DIREKT auf dem <a>.
function Cta({ cta }: { cta: { href?: string; label?: string } }) {
  return <a data-ek-field="cta" href={cta?.href ?? "#"}>{cta?.label ?? ""}</a>;
}
// CTA-Button mit Wrapper: data-ek-field auf dem <div>, der <a> liegt darin und
// trägt ein <span>-Label (verschachtelter Klick-Fall).
function CtaWrapper({ cta }: { cta: { href?: string; label?: string } }) {
  return (
    <div data-ek-field="cta">
      <a href={cta?.href ?? "#"}><span>{cta?.label ?? ""}</span></a>
    </div>
  );
}
// Link ganz ohne editierbares Feld (kein data-ek-field) – nur Navigation schlucken.
function Naked() {
  return <div><a href="/extern">Extern</a></div>;
}
const registry = createRegistry([
  { definition: defineBlock({ type: "Hero", label: "Hero", schema: z.object({ headline: ekText() }) }), component: Hero },
  { definition: defineBlock({ type: "Text", label: "Text", schema: z.object({ body: ekText() }) }), component: Text },
  { definition: defineBlock({ type: "Prose", label: "Prosa", schema: z.object({ body: ekRichText() }) }), component: Prose },
  { definition: defineBlock({ type: "Banner", label: "Banner", schema: z.object({ image: ekImage() }) }), component: Banner },
  {
    definition: defineBlock({
      type: "Icon",
      label: "Icon",
      schema: z.object({ icon: ekSelect({ options: [{ value: "bolt", label: "Blitz" }, { value: "star" }] }) }),
    }),
    component: Icon,
  },
  { definition: defineBlock({ type: "Cta", label: "Button", schema: z.object({ cta: ekLink() }) }), component: Cta },
  { definition: defineBlock({ type: "CtaWrapper", label: "Button (Wrapper)", schema: z.object({ cta: ekLink() }) }), component: CtaWrapper },
  { definition: defineBlock({ type: "Naked", label: "Naked", schema: z.object({}) }), component: Naked },
]);

const content: PageContent = {
  schemaVersion: "0.1.0",
  blocks: [
    { id: "b1", type: "Hero", props: { headline: "Original" } },
    { id: "b2", type: "Text", props: { body: "Zweiter" } },
    { id: "b3", type: "Prose", props: { body: "<strong>fett</strong> normal" } },
    { id: "b4", type: "Banner", props: { image: { assetId: "", url: "" } } },
    { id: "b5", type: "Icon", props: { icon: "bolt" } },
    { id: "b6", type: "Cta", props: { cta: { href: "/preise", label: "Jetzt starten" } } },
    { id: "b7", type: "CtaWrapper", props: { cta: { href: "/kontakt", label: "Kontakt" } } },
    // richText mit Inline-Link – Label kommt aus dem Rich-Text-Inhalt.
    { id: "b8", type: "Prose", props: { body: '<p>Mehr <a href="/alt">hier</a></p>' } },
    // Link ganz ohne editierbares Feld (kein data-ek-field im Block).
    { id: "b9", type: "Naked", props: {} },
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

  it("zeigt die Listen- und Zitat-Buttons bei fokussiertem richText-Feld", () => {
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
    expect(container.querySelector('[data-editkraft-toolbar] button[title="Bullet list"]')).toBeTruthy();
    expect(container.querySelector('[data-editkraft-toolbar] button[title="Numbered list"]')).toBeTruthy();
    expect(container.querySelector('[data-editkraft-toolbar] button[title="Quote"]')).toBeTruthy();
  });

  it("UL/OL/Zitat-Buttons feuern die richtigen Editor-Kommandos", () => {
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
    const exec = vi.spyOn(document, "execCommand");
    const click = (title: string) => {
      const btn = container.querySelector(`[data-editkraft-toolbar] button[title="${title}"]`) as HTMLElement;
      expect(btn).toBeTruthy();
      act(() => {
        fireEvent.click(btn);
      });
    };
    click("Bullet list");
    expect(exec).toHaveBeenCalledWith("insertUnorderedList");
    click("Numbered list");
    expect(exec).toHaveBeenCalledWith("insertOrderedList");
    click("Quote");
    expect(exec).toHaveBeenCalledWith("formatBlock", false, "<blockquote>");
    exec.mockRestore();
    vi.useRealTimers();
  });
});

describe("Select-Feld", () => {
  it("ist nicht contentEditable", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    expect(fieldEl(container, "b5", "icon").getAttribute("contenteditable")).toBeNull();
  });

  it("Klick öffnet das Options-Popover mit allen Options (Label bzw. Wert)", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    fireEvent.click(fieldEl(container, "b5", "icon"));
    const popover = container.querySelector("[data-editkraft-select-popover]");
    expect(popover).toBeTruthy();
    const labels = Array.from(popover!.querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toContain("Blitz"); // Option mit Label
    expect(labels).toContain("star"); // Option ohne Label → Wert
  });

  it("Klick auf eine Option sendet SOFORT ek:update mit dem Wert und schließt das Popover", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    fireEvent.click(fieldEl(container, "b5", "icon"));
    post.mockClear();

    const option = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-editkraft-select-popover] button"),
    ).find((b) => b.textContent === "star");
    expect(option).toBeTruthy();
    fireEvent.click(option!);

    // Ohne Debounce: das Update liegt direkt nach dem Klick vor.
    const upd = post.mock.calls
      .map((c) => c[0] as { type: string; blockId?: string; props?: Record<string, unknown> })
      .find((x) => x.type === "ek:update");
    expect(upd?.blockId).toBe("b5");
    expect(upd?.props?.icon).toBe("star");
    expect(post.mock.calls[0]![1]).toBe(STUDIO);
    // Popover ist geschlossen, der neue Wert lokal gerendert.
    expect(container.querySelector("[data-editkraft-select-popover]")).toBeNull();
    expect(fieldEl(container, "b5", "icon").textContent).toBe("star");
    post.mockRestore();
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
      (c) => c[0] as { channel?: string; type: string; blockId?: string; fieldKey?: string; v?: number },
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

describe("Link-/Button-Klicks (nie navigieren, immer bearbeiten)", () => {
  const linkPopover = (c: HTMLElement) => c.querySelector("[data-editkraft-link-popover]");
  const inputByValue = (c: HTMLElement, value: string) =>
    Array.from(c.querySelectorAll<HTMLInputElement>("[data-editkraft-link-popover] input")).find(
      (i) => i.value === value,
    );

  it("Klick auf einen CTA-<a> (kind=link) öffnet das CTA-Popover, ohne zu navigieren", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    const anchor = container.querySelector('[data-editkraft-block-id="b6"] a') as HTMLElement;
    const navigated = fireEvent.click(anchor); // false ⇒ preventDefault wurde aufgerufen
    expect(navigated).toBe(false);
    expect(linkPopover(container)).toBeTruthy();
    // Popover ist mit Label + URL des Buttons vorbelegt.
    expect(inputByValue(container, "Jetzt starten")).toBeTruthy();
    expect(inputByValue(container, "/preise")).toBeTruthy();
  });

  it("Klick auf ein <span> IM <a> eines Wrapper-CTA (data-ek-field auf dem <div>) öffnet das CTA-Popover", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    // Verschachtelter Klick: Ziel ist das <span>, closest("a") muss greifen.
    const span = container.querySelector('[data-editkraft-block-id="b7"] a span') as HTMLElement;
    const navigated = fireEvent.click(span);
    expect(navigated).toBe(false);
    expect(linkPopover(container)).toBeTruthy();
    expect(inputByValue(container, "Kontakt")).toBeTruthy();
    expect(inputByValue(container, "/kontakt")).toBeTruthy();
  });

  it("Klick auf einen Inline-<a> in einem richText-Feld öffnet das Inline-Popover (mit Remove)", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    const anchor = container.querySelector('[data-editkraft-block-id="b8"] a') as HTMLElement;
    const navigated = fireEvent.click(anchor);
    expect(navigated).toBe(false);
    const popover = linkPopover(container);
    expect(popover).toBeTruthy();
    // Nur das Inline-Popover hat einen "Remove"-Button (CTA nicht).
    const buttons = Array.from(popover!.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).toContain("Remove");
  });

  it("Klick auf einen <a> OHNE editierbares Feld navigiert nicht und öffnet kein Popover", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    post.mockClear();
    const anchor = container.querySelector('[data-editkraft-block-id="b9"] a') as HTMLElement;
    const navigated = fireEvent.click(anchor);
    expect(navigated).toBe(false); // preventDefault greift trotzdem
    expect(linkPopover(container)).toBeNull();
    // Der getroffene Block wird stattdessen selektiert (wie der Block-/Bild-Pfad).
    const select = post.mock.calls
      .map((c) => c[0] as { type: string; blockId?: string })
      .find((m) => m.type === "ek:select");
    expect(select?.blockId).toBe("b9");
    post.mockRestore();
  });
});

describe("Popover schließt bei Außenklick/Escape", () => {
  const linkPopover = (c: HTMLElement) => c.querySelector("[data-editkraft-link-popover]");
  const inputByValue = (c: HTMLElement, value: string) =>
    Array.from(c.querySelectorAll<HTMLInputElement>("[data-editkraft-link-popover] input")).find(
      (i) => i.value === value,
    );
  const pointerDownOn = (el: Element) =>
    act(() => {
      el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

  it("Klick daneben schließt das offene CTA-Popover", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    fireEvent.click(container.querySelector('[data-editkraft-block-id="b6"] a')!);
    expect(linkPopover(container)).toBeTruthy();
    pointerDownOn(document.body);
    expect(linkPopover(container)).toBeNull();
  });

  it("Klick INS Popover schließt es nicht", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    fireEvent.click(container.querySelector('[data-editkraft-block-id="b6"] a')!);
    const input = container.querySelector("[data-editkraft-link-popover] input")!;
    pointerDownOn(input);
    expect(linkPopover(container)).toBeTruthy();
  });

  it("Escape schließt das offene Popover", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    fireEvent.click(container.querySelector('[data-editkraft-block-id="b6"] a')!);
    expect(linkPopover(container)).toBeTruthy();
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(linkPopover(container)).toBeNull();
  });

  it("Klick von einem offenen Popover direkt auf ein anderes Objekt: altes zu, neues auf", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    fireEvent.click(container.querySelector('[data-editkraft-block-id="b6"] a')!);
    expect(inputByValue(container, "Jetzt starten")).toBeTruthy();
    // Ein Gestus: pointerdown schließt das alte, der folgende click öffnet das neue.
    const other = container.querySelector('[data-editkraft-block-id="b7"] a') as HTMLElement;
    pointerDownOn(other);
    fireEvent.click(other);
    expect(linkPopover(container)).toBeTruthy();
    expect(inputByValue(container, "Kontakt")).toBeTruthy();
    expect(inputByValue(container, "Jetzt starten")).toBeUndefined();
  });

  it("Außenklick ÜBERNIMMT den geänderten Wert (kein Verwerfen)", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    fireEvent.click(container.querySelector('[data-editkraft-block-id="b6"] a')!);
    fireEvent.change(inputByValue(container, "/preise")!, { target: { value: "/neu" } });
    post.mockClear();
    pointerDownOn(document.body);
    const upd = post.mock.calls
      .map((c) => c[0] as { type: string; blockId?: string; props?: { cta?: { href?: string } } })
      .find((x) => x.type === "ek:update" && x.blockId === "b6");
    expect(upd?.props?.cta?.href).toBe("/neu");
    expect(linkPopover(container)).toBeNull();
    post.mockRestore();
  });

  it("schließt auch das Select-Popover bei Klick daneben", () => {
    const { container } = render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
    fireEvent.click(fieldEl(container, "b5", "icon"));
    expect(container.querySelector("[data-editkraft-select-popover]")).toBeTruthy();
    pointerDownOn(document.body);
    expect(container.querySelector("[data-editkraft-select-popover]")).toBeNull();
  });
});

describe("Site-Globals", () => {
  const globalsDefinition = defineGlobals({
    schema: z.object({ phone: ekText({ label: "Telefon" }), claim: ekText() }),
  });
  const globalsProp = {
    definition: globalsDefinition,
    values: { phone: "0176 1", claim: "Alter Claim" },
  };

  function KontaktBlock({ title, globals }: { title: string; globals?: Record<string, unknown> }) {
    return (
      <div>
        <span data-ek-field="title">{title}</span>
        <span data-ek-global="phone">{String(globals?.phone ?? "")}</span>
      </div>
    );
  }
  const globalsRegistry = createRegistry([
    {
      definition: defineBlock({ type: "Kontakt", label: "Kontakt", schema: z.object({ title: ekText() }) }),
      component: KontaktBlock,
    },
  ]);
  const globalsContent: PageContent = {
    schemaVersion: "0.1.0",
    blocks: [{ id: "k1", type: "Kontakt", props: { title: "Kontakt" } }],
  };

  const renderWithGlobals = () =>
    render(
      <EditkraftPreview
        content={globalsContent}
        registry={globalsRegistry}
        studioOrigin={STUDIO}
        globals={globalsProp}
      />,
    );

  const globalEl = (container: HTMLElement, key: string) =>
    container.querySelector<HTMLElement>(`[data-ek-global="${key}"]`)!;

  it("meldet ek:globals (Deskriptoren + Werte) beim Mount", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    renderWithGlobals();
    const msg = post.mock.calls
      .map((c) => c[0] as { type: string; fields?: unknown[]; values?: Record<string, unknown> })
      .find((m) => m.type === "ek:globals");
    expect(msg).toBeTruthy();
    expect(msg!.fields).toEqual([
      { kind: "text", label: "Telefon", key: "phone", optional: false },
      { kind: "text", key: "claim", optional: false },
    ]);
    expect(msg!.values).toEqual({ phone: "0176 1", claim: "Alter Claim" });
    post.mockRestore();
  });

  it("sendet ohne globals-Prop KEIN ek:globals (Verhalten wie bisher)", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    render(<EditkraftPreview content={globalsContent} registry={globalsRegistry} studioOrigin={STUDIO} />);
    const types = post.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain("ek:globals");
    post.mockRestore();
  });

  it("rendert Blöcke mit den Globals-Werten als Prop und macht data-ek-global editierbar", () => {
    const { container } = renderWithGlobals();
    const el = globalEl(container, "phone");
    expect(el.textContent).toBe("0176 1");
    expect(el.getAttribute("contenteditable")).toBe("true");
  });

  it("Tippen in einem Globals-Feld sendet ek:global-update (debounced)", () => {
    vi.useFakeTimers();
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = renderWithGlobals();
    const el = globalEl(container, "phone");
    post.mockClear();
    act(() => {
      el.focus();
      el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      el.textContent = "0151 999";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      vi.advanceTimersByTime(400);
    });
    const upd = post.mock.calls
      .map((c) => c[0] as { type: string; values?: Record<string, unknown> })
      .find((x) => x.type === "ek:global-update");
    expect(upd?.values).toEqual({ phone: "0151 999" });
    post.mockRestore();
    vi.useRealTimers();
  });

  it("eingehendes ek:global-update aktualisiert die Canvas-Vorkommen", async () => {
    const { container } = renderWithGlobals();
    dispatchFromStudio(createMessage("ek:global-update", { values: { phone: "0700 42" } }));
    await waitFor(() => expect(globalEl(container, "phone").textContent).toBe("0700 42"));
  });

  it("Echo-Guard: eingehendes ek:global-update überschreibt das fokussierte Global nicht", () => {
    const { container } = renderWithGlobals();
    const el = globalEl(container, "phone");
    act(() => {
      el.focus();
      el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      el.textContent = "Vom Nutzer getippt";
    });
    dispatchFromStudio(createMessage("ek:global-update", { values: { phone: "Echo vom Studio" } }));
    expect(globalEl(container, "phone").textContent).toBe("Vom Nutzer getippt");
  });

  it("Verlassen des Globals-Felds übernimmt den Wert in den State (alle Vorkommen)", async () => {
    const { container } = renderWithGlobals();
    const el = globalEl(container, "phone");
    act(() => {
      el.focus();
      el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      el.textContent = "0800 7";
      el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await waitFor(() => expect(globalEl(container, "phone").textContent).toBe("0800 7"));
  });
});

// --- Item-Modus (Collections): synthetischer Ein-Block-Baum ------------------
// Die Preview-Seite baut den Baum via itemToBlock und übergibt ihn als ganz
// normales `content` — EditkraftPreview braucht keinen eigenen Item-Pfad, weil
// die Registry jede Collection als synthetischen Block registriert.

function ArticleTemplate({ item }: { item: { title: string; body: string } }) {
  return (
    <article>
      <h1 data-ek-field="title">{item.title}</h1>
      <div data-ek-field="body" dangerouslySetInnerHTML={{ __html: item.body }} />
    </article>
  );
}

const blogDef = defineCollection({
  slug: "blog",
  name: "Blog",
  schema: z.object({ title: ekText({ label: "Titel" }), body: ekRichText({ label: "Body" }) }),
});

const itemRegistry = createRegistry([
  { definition: defineBlock({ type: "Hero", label: "Hero", schema: z.object({ headline: ekText() }) }), component: Hero },
  { collection: blogDef, template: ArticleTemplate },
]);

const itemContent: PageContent = {
  schemaVersion: "0.1.0",
  blocks: [itemToBlock("blog", "item-1", { title: "Hallo Welt", body: "<p>Erster <strong>Beitrag</strong></p>" })],
};

describe("EditkraftPreview — Item-Modus (Collections)", () => {
  it("rendert das registrierte Template für den synthetischen $collection-Block", () => {
    const { container } = render(
      <EditkraftPreview content={itemContent} registry={itemRegistry} studioOrigin={STUDIO} />,
    );
    expect(screen.getByText("Hallo Welt")).toBeTruthy();
    expect(container.querySelector("article strong")?.textContent).toBe("Beitrag");
    // Der Block-Wrapper trägt die itemId als blockId (Studio adressiert damit).
    expect(container.querySelector('[data-editkraft-block-id="item-1"]')).toBeTruthy();
  });

  it("sendet ek:schema inkl. der Collection-Feld-Deskriptoren", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    render(<EditkraftPreview content={itemContent} registry={itemRegistry} studioOrigin={STUDIO} />);
    const schema = post.mock.calls
      .map((c) => c[0] as { type: string; blocks?: { type: string; fields?: unknown }[] })
      .find((m) => m.type === "ek:schema");
    const collectionDescriptor = schema?.blocks?.find((b) => b.type === "$collection:blog");
    expect(collectionDescriptor).toBeTruthy();
    expect(collectionDescriptor!.fields).toEqual(blogDef.fields);
    post.mockRestore();
  });

  it("macht data-ek-field-Felder des Templates editierbar (text + richText)", () => {
    const { container } = render(
      <EditkraftPreview content={itemContent} registry={itemRegistry} studioOrigin={STUDIO} />,
    );
    expect(fieldEl(container, "item-1", "title").getAttribute("contenteditable")).toBe("true");
    expect(fieldEl(container, "item-1", "body").getAttribute("contenteditable")).toBe("true");
  });

  it("Klick/Fokus in ein Feld meldet ek:focus-field, Tippen sendet ek:update mit den Feldwerten", () => {
    vi.useFakeTimers();
    const post = vi.spyOn(window.parent, "postMessage");
    const { container } = render(
      <EditkraftPreview content={itemContent} registry={itemRegistry} studioOrigin={STUDIO} />,
    );
    const el = fieldEl(container, "item-1", "title");
    post.mockClear();
    act(() => {
      el.focus();
      el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      el.textContent = "Neuer Titel";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      vi.advanceTimersByTime(400);
    });
    const messages = post.mock.calls.map(
      (c) => c[0] as { type: string; blockId?: string; fieldKey?: string; props?: Record<string, unknown> },
    );
    const focus = messages.find((m) => m.type === "ek:focus-field");
    expect(focus?.blockId).toBe("item-1");
    expect(focus?.fieldKey).toBe("title");
    const upd = messages.find((m) => m.type === "ek:update");
    expect(upd?.blockId).toBe("item-1");
    expect(upd?.props?.title).toBe("Neuer Titel");
    post.mockRestore();
    vi.useRealTimers();
  });

  it("ek:update aus dem Studio aktualisiert das Template live", async () => {
    render(<EditkraftPreview content={itemContent} registry={itemRegistry} studioOrigin={STUDIO} />);
    dispatchFromStudio(createMessage("ek:update", { blockId: "item-1", props: { title: "Live geändert" } }));
    await waitFor(() => expect(screen.getByText("Live geändert")).toBeTruthy());
  });

  it("Fokus in das richText-Feld des Templates zeigt die Format-Toolbar", () => {
    const { container } = render(
      <EditkraftPreview content={itemContent} registry={itemRegistry} studioOrigin={STUDIO} />,
    );
    const el = fieldEl(container, "item-1", "body");
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
    expect(container.querySelector("[data-editkraft-toolbar]")).toBeTruthy();
  });
});

describe("Eingehendes ek:tree (Struktur-Edits aus dem Studio)", () => {
  it("ersetzt den Baum und rendert die neue Struktur", async () => {
    const { container } = render(
      <EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />,
    );
    const next: PageContent = {
      schemaVersion: "0.1.0",
      blocks: [
        { id: "b2", type: "Hero", props: { headline: "Neu eingefügt" } },
        ...content.blocks,
      ],
    };
    dispatchFromStudio(createMessage("ek:tree", { content: next }));
    await waitFor(() => expect(screen.getByText("Neu eingefügt")).toBeTruthy());
    expect(container.querySelectorAll("[data-editkraft-block-id]").length).toBeGreaterThanOrEqual(
      next.blocks.length,
    );
  });
});
