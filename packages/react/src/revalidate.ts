import { revalidateTag } from "next/cache";
import { pageTag } from "./data";

export interface RevalidateHandlerOptions {
  /** Shared Secret; typischerweise process.env.EDITKRAFT_REVALIDATE_SECRET. */
  secret?: string | undefined;
  /**
   * Ermittelt betroffene Seiten-Slugs aus dem Webhook-Payload.
   * Default: Supabase-DB-Webhook auf ek_pages (record/old_record.slug).
   */
  resolveSlugs?: ((payload: unknown) => string[]) | undefined;
}

type WebhookPayload = {
  record?: { slug?: unknown } | null;
  old_record?: { slug?: unknown } | null;
};

function defaultResolveSlugs(payload: unknown): string[] {
  const p = (payload ?? {}) as WebhookPayload;
  const slugs = new Set<string>();
  for (const rec of [p.record, p.old_record]) {
    if (rec && typeof rec.slug === "string" && rec.slug) slugs.add(rec.slug);
  }
  return [...slugs];
}

/** Längensicherer, konstantzeitähnlicher String-Vergleich (auch edge-tauglich). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function extractSecret(request: Request): string | null {
  const header = request.headers.get("x-editkraft-secret");
  if (header) return header;
  const url = new URL(request.url);
  return url.searchParams.get("secret");
}

/**
 * Erzeugt einen Next-Route-Handler (POST) für /api/editkraft/revalidate.
 * Wird per Supabase-Webhook beim Publish aufgerufen, mit Shared Secret
 * abgesichert, und invalidiert den ISR-Tag der betroffenen Seite(n).
 *
 * Antworten: 500 (kein Secret konfiguriert), 401 (falsches Secret),
 * 200 (revalidiert, mit Liste der Slugs).
 */
export function createRevalidateHandler(options: RevalidateHandlerOptions) {
  return async function POST(request: Request): Promise<Response> {
    if (!options.secret) {
      return Response.json(
        { error: "EDITKRAFT_REVALIDATE_SECRET ist nicht konfiguriert." },
        { status: 500 },
      );
    }

    const provided = extractSecret(request);
    if (!provided || !safeEqual(provided, options.secret)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => null);
    const slugs = (options.resolveSlugs ?? defaultResolveSlugs)(payload);
    for (const slug of slugs) {
      revalidateTag(pageTag(slug));
    }

    return Response.json({ revalidated: true, slugs });
  };
}
