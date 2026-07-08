import { createClient } from "@supabase/supabase-js";

/**
 * Öffentlicher Supabase-Client des Kundenprojekts (Anon-Key). Über RLS liest er
 * ausschließlich published Content – kein Editkraft-Backend im Lese-Pfad.
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}
