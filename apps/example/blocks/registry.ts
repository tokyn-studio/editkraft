import { createRegistry } from "@editkraft/react";
import { defineBlock, ekText, ekImage, ekLink } from "@editkraft/schema";
import { z } from "zod";
import { Hero } from "./Hero";

/**
 * Block-Registry: paart jede Block-Definition mit ihrer React-Komponente.
 * createRegistry validiert, dass jeder Typ Definition UND Komponente hat.
 */
export const registry = createRegistry([
  {
    definition: defineBlock({
      type: "Hero",
      label: "Hero-Bereich",
      schema: z.object({
        headline: ekText({ label: "Überschrift" }),
        image: ekImage({ label: "Bild" }),
        cta: ekLink({ label: "Button" }).optional(),
      }),
    }),
    component: Hero,
  },
]);
