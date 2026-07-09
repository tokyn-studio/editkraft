import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderBlocks } from "@editkraft/react";
import { registry } from "../blocks/registry";

describe("Hero-Feld-Bindung", () => {
  it("trägt data-ek-field-Marker und gibt RichText sanitisiert aus", () => {
    const html = renderToStaticMarkup(
      renderBlocks(
        [{ id: "h", type: "Hero", props: {
          headline: "Titel",
          body: "<b>fett</b><script>alert(1)</script>",
          image: { assetId: "", url: "" },
        } }],
        registry,
      ),
    );
    expect(html).toContain('data-ek-field="headline"');
    expect(html).toContain('data-ek-field="body"');
    expect(html).toContain('data-ek-field="image"');
    expect(html).toContain("<strong>fett</strong>");
    expect(html).not.toContain("<script>");
  });
});
