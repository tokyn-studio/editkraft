import { draftMode } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Aktiviert den Next.js Draft Mode und leitet zur Preview-Route weiter.
 * Nur für die lokale Demo – in Produktion würde das Studio diesen Einstieg
 * abgesichert aufrufen.
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? "start";
  (await draftMode()).enable();
  redirect(`/editkraft/preview/${slug}`);
}
