import { pageTag } from "./data";

export interface RevalidateHandlerOptions {
  /** Shared secret; typically process.env.EDITKRAFT_REVALIDATE_SECRET. */
  secret?: string | undefined;
  /**
   * Resolves affected page slugs from the webhook payload.
   * Default: Supabase DB webhook on ek_pages (record/old_record.slug).
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

/** Length-safe, constant-time-like string comparison (edge-compatible). */
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
 * Creates a Next route handler (POST) for /api/editkraft/revalidate.
 * Called by a Supabase webhook on publish, secured with a shared secret,
 * and invalidates the ISR tag of the affected page(s).
 *
 * Responses: 500 (no secret configured), 401 (wrong secret),
 * 200 (revalidated, with the list of slugs).
 */
export function createRevalidateHandler(options: RevalidateHandlerOptions) {
  return async function POST(request: Request): Promise<Response> {
    if (!options.secret) {
      return Response.json(
        { error: "EDITKRAFT_REVALIDATE_SECRET is not configured." },
        { status: 500 },
      );
    }

    const provided = extractSecret(request);
    if (!provided || !safeEqual(provided, options.secret)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => null);
    const slugs = (options.resolveSlugs ?? defaultResolveSlugs)(payload);
    // Lazy import: next/cache is only pulled at runtime so the static module
    // graph stays clean (e.g. when imported in client-adjacent trees).
    const { revalidateTag } = await import("next/cache");
    for (const slug of slugs) {
      revalidateTag(pageTag(slug));
    }

    return Response.json({ revalidated: true, slugs });
  };
}
