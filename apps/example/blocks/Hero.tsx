import { sanitizeRichText, type EkImageValue, type EkLinkValue } from "@editkraft/schema";

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
      <h1 data-ek-field="headline">{headline}</h1>
      {body ? <div data-ek-field="body" dangerouslySetInnerHTML={{ __html: sanitizeRichText(body) }} /> : null}
      <div data-ek-field="image">
        {image?.url ? <img src={image.url} alt={image.alt ?? ""} /> : null}
      </div>
      {cta ? <a href={cta.href}>{cta.label ?? cta.href}</a> : null}
    </section>
  );
}
