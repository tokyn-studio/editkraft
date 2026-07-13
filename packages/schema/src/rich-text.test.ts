import { describe, expect, it } from "vitest";
import { sanitizeRichText, RICH_TEXT_ALLOWLIST } from "./rich-text";

describe("sanitizeRichText", () => {
  it("behält erlaubte Inline-Tags", () => {
    expect(sanitizeRichText("<strong>a</strong> und <em>b</em>")).toBe("<strong>a</strong> und <em>b</em>");
  });

  it("normalisiert <b>/<i> zu <strong>/<em>", () => {
    expect(sanitizeRichText("<b>x</b><i>y</i>")).toBe("<strong>x</strong><em>y</em>");
  });

  it("entfernt <script> samt Inhalt", () => {
    expect(sanitizeRichText('a<script>alert(1)</script>b')).toBe("ab");
  });

  it("entfernt unbekannte Tags, behält deren Text", () => {
    expect(sanitizeRichText('<div class="x">text</div>')).toBe("text");
  });

  it("behält sichere hrefs, verwirft javascript:-URLs (Text bleibt)", () => {
    expect(sanitizeRichText('<a href="https://x.de">link</a>')).toBe('<a href="https://x.de">link</a>');
    expect(sanitizeRichText('<a href="javascript:alert(1)">böse</a>')).toBe("böse");
  });

  it("droppt alle Attribute außer href auf <a>", () => {
    expect(sanitizeRichText('<a href="/x" onclick="evil()">t</a>')).toBe('<a href="/x">t</a>');
  });

  it("verwirft protocol-relative hrefs (//evil.example, Text bleibt)", () => {
    expect(sanitizeRichText('<a href="//evil.example/x">t</a>')).toBe("t");
  });

  it("verwirft backslash-normalisierte hrefs (/\\evil.example, Text bleibt)", () => {
    expect(sanitizeRichText('<a href="/\\evil.example/x">t</a>')).toBe("t");
  });

  it("behält legitime relative Pfade (/about)", () => {
    expect(sanitizeRichText('<a href="/about">t</a>')).toBe('<a href="/about">t</a>');
  });

  it("escapt rohe Winkelklammern in Text", () => {
    expect(sanitizeRichText("1 < 2 & 3 > 0")).toBe("1 &lt; 2 &amp; 3 &gt; 0");
  });

  it("schließt offene Tags am Ende", () => {
    expect(sanitizeRichText("<strong>x")).toBe("<strong>x</strong>");
  });

  it("ist idempotent", () => {
    const dirty = '<div><b>x</b> & <a href="javascript:1">y</a> < z</div>';
    const once = sanitizeRichText(dirty);
    expect(sanitizeRichText(once)).toBe(once);
  });

  it("Allowlist ist stabil", () => {
    expect(Object.keys(RICH_TEXT_ALLOWLIST).sort()).toEqual([
      "a", "blockquote", "br", "code", "em", "h2", "h3", "hr", "li", "ol", "p", "s", "strong", "u", "ul",
    ]);
  });

  // --- Erweiterung 0.5.0: Listen, Void-Tags, code/blockquote, a[target] ---

  it("erlaubt Listen (ul/ol/li)", () => {
    const html = "<ul><li>eins</li><li>zwei</li></ul><ol><li>drei</li></ol>";
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("erlaubt blockquote und code", () => {
    const html = "<blockquote><p>Zitat</p></blockquote><p><code>x = 1</code></p>";
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("baut br/hr als Void-Tags neu auf (auch self-closing), ohne Schliesstag", () => {
    expect(sanitizeRichText("a<br>b<br/>c<hr>")).toBe("a<br>b<br>c<hr>");
  });

  it("verwirft schliessende Void-Tags (</br>)", () => {
    expect(sanitizeRichText("a</br>b")).toBe("ab");
  });

  it("a mit target=_blank erzwingt rel=noopener noreferrer", () => {
    expect(sanitizeRichText('<a href="https://x.de" target="_blank" rel="evil">t</a>')).toBe(
      '<a href="https://x.de" target="_blank" rel="noopener noreferrer">t</a>',
    );
  });

  it("a mit anderem target verliert das target", () => {
    expect(sanitizeRichText('<a href="/a" target="_parent">t</a>')).toBe('<a href="/a">t</a>');
  });

  it("bleibt idempotent mit den neuen Tags", () => {
    const dirty = '<ul><li>a<br>b</li></ul><a href="https://x.de" target="_blank">l</a><hr>';
    const once = sanitizeRichText(dirty);
    expect(sanitizeRichText(once)).toBe(once);
  });
});
