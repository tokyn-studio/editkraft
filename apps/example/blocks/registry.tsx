import { createRegistry } from "@editkraft/react";
import { defineBlock, ekText, ekRichText, type EkImageValue } from "@editkraft/schema";
import { z } from "zod";

function Hero({ headline, subline }: { headline: string; subline?: string }) {
  return (
    <section data-block="Hero">
      <h1>{headline}</h1>
      {subline ? <p>{subline}</p> : null}
    </section>
  );
}

function RichText({ html }: { html: string }) {
  return <div data-block="RichText" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Beispiel-Registry mit zwei Blöcken (Hero + RichText). */
export const registry = createRegistry([
  {
    definition: defineBlock({
      type: "Hero",
      label: "Hero-Bereich",
      schema: z.object({
        headline: ekText({ label: "Überschrift" }),
        subline: ekText({ label: "Unterzeile" }).optional(),
      }),
    }),
    component: Hero,
  },
  {
    definition: defineBlock({
      type: "RichText",
      label: "Fließtext",
      schema: z.object({
        html: ekRichText({ label: "Text" }),
      }),
    }),
    component: RichText,
  },
]);

export type { EkImageValue };
