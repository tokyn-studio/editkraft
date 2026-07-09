import type { EkImageValue, EkLinkValue } from "@editkraft/schema";

/**
 * Beispiel-Block. Passe Markup und Styling an dein Design an – die Props kommen
 * validiert aus der Block-Definition in blocks/registry.ts.
 */
export function Hero({
  headline,
  image,
  cta,
}: {
  headline: string;
  image: EkImageValue;
  cta?: EkLinkValue;
}) {
  return (
    <section>
      <h1>{headline}</h1>
      {image?.url ? <img src={image.url} alt={image.alt ?? ""} /> : null}
      {cta ? <a href={cta.href}>{cta.label ?? cta.href}</a> : null}
    </section>
  );
}
