"use client";

import type { PageContent } from "@editkraft/schema";
import { EditkraftPreview } from "@editkraft/react/preview";
import { registry } from "@/blocks/registry";

/**
 * Client-Wrapper: importiert die Registry (mit Komponenten) client-seitig, damit
 * keine Funktionen über die Server→Client-Grenze gereicht werden. Der Server
 * übergibt nur den serialisierbaren Draft-Content.
 */
export function PreviewClient({
  content,
  studioOrigin,
}: {
  content: PageContent;
  studioOrigin: string;
}) {
  return <EditkraftPreview content={content} registry={registry} studioOrigin={studioOrigin} />;
}
