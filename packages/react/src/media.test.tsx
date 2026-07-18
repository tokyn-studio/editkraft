import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EkMediaValue } from "@editkraft/schema";
import { EkMedia } from "./media";

describe("EkMedia", () => {
  it("rendert ein <img> für Werte ohne kind (abwärtskompatibel)", () => {
    const value: EkMediaValue = { assetId: "", url: "https://x/foto.jpg", alt: "Foto" };
    const html = renderToStaticMarkup(<EkMedia value={value} className="hero" />);
    expect(html).toContain("<img");
    expect(html).toContain('src="https://x/foto.jpg"');
    expect(html).toContain('alt="Foto"');
    expect(html).toContain('class="hero"');
    expect(html).not.toContain("<video");
  });

  it("rendert ein <img> auch bei kind:image", () => {
    const value: EkMediaValue = { assetId: "", url: "https://x/foto.jpg", kind: "image" };
    const html = renderToStaticMarkup(<EkMedia value={value} />);
    expect(html).toContain("<img");
    expect(html).not.toContain("<video");
    // Fehlender alt-Text wird zu leerem alt (Screenreader-korrekt).
    expect(html).toContain('alt=""');
  });

  it("rendert ein autoplayendes, stummes Hintergrund-Video ohne controls", () => {
    const value: EkMediaValue = {
      assetId: "",
      url: "https://x/clip.mp4",
      kind: "video",
      poster: "https://x/poster.jpg",
    };
    const html = renderToStaticMarkup(<EkMedia value={value} />);
    expect(html).toContain("<video");
    expect(html).toContain('src="https://x/clip.mp4"');
    expect(html).toContain('poster="https://x/poster.jpg"');
    expect(html).toContain("muted");
    expect(html).toContain("loop");
    expect(html).toMatch(/autoplay|autoPlay/i);
    expect(html).toMatch(/playsinline|playsInline/i);
    // controls fehlt (Default false).
    expect(html).not.toContain("controls");
    expect(html).not.toContain("<img");
  });

  it("zeigt Steuerelemente bei controls:true", () => {
    const value: EkMediaValue = {
      assetId: "",
      url: "https://x/clip.mp4",
      kind: "video",
      controls: true,
    };
    const html = renderToStaticMarkup(<EkMedia value={value} />);
    expect(html).toContain("controls");
  });

  it("wendet Frame-Styles auf gerahmte Medien an (Container + Medium)", () => {
    const value: EkMediaValue = {
      assetId: "",
      url: "https://x/foto.jpg",
      frame: { x: 25, y: 75, zoom: 2 },
    };
    const html = renderToStaticMarkup(<EkMedia value={value} />);
    // Quadratischer, überlaufsschneidender Container.
    expect(html).toContain("aspect-ratio:1 / 1");
    expect(html).toContain("overflow:hidden");
    // Medium sitzt als cover mit Fokuspunkt + Zoom.
    expect(html).toContain("object-fit:cover");
    expect(html).toContain("object-position:25% 75%");
    expect(html).toContain("scale(2)");
  });

  it("rendert gerahmtes Video mit denselben Frame-Styles", () => {
    const value: EkMediaValue = {
      assetId: "",
      url: "https://x/clip.mp4",
      kind: "video",
      frame: { x: 50, y: 50, zoom: 1 },
    };
    const html = renderToStaticMarkup(<EkMedia value={value} />);
    expect(html).toContain("<video");
    expect(html).toContain("object-fit:cover");
    expect(html).toContain("muted");
  });
});
