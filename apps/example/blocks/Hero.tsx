import type { CSSProperties } from "react";
import { sanitizeRichText, imageFrameStyles, type EkImageValue, type EkLinkValue } from "@editkraft/schema";

/**
 * Beispiel-Block. `data-ek-field` bindet Elemente an ihre Felder – das Studio
 * macht sie im Editor direkt anklick- und editierbar. RichText wird über den
 * kanonischen Sanitizer ausgegeben.
 */
export function Hero({
  headline,
  body,
  image,
  cta,
}: {
  headline: string;
  body?: string;
  image: EkImageValue;
  cta?: EkLinkValue;
}) {
  return (
    <section>
      <h1 data-ek-field="headline" dangerouslySetInnerHTML={{ __html: sanitizeRichText(headline) }} />
      {body ? <div data-ek-field="body" dangerouslySetInnerHTML={{ __html: sanitizeRichText(body) }} /> : null}
      {(() => {
        const fs = imageFrameStyles(image?.frame);
        return (
          <div data-ek-field="image" style={fs.container as CSSProperties}>
            {image?.url ? (
              <img src={image.url} alt={image.alt ?? ""} style={fs.image as CSSProperties} />
            ) : null}
          </div>
        );
      })()}
      {cta ? (
        <a data-ek-field="cta" href={cta.href}>
          {cta.label ?? cta.href}
        </a>
      ) : null}
    </section>
  );
}
