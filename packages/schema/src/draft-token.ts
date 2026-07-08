/**
 * Signiertes, kurzlebiges Draft-Token für die Preview (cookie-frei über URL-Param).
 * HMAC-SHA256 via Web Crypto – kein zusätzliches Package, läuft in Node ≥ 20,
 * Edge und Browser. Studio erzeugt das Token, die Preview-Route verifiziert es.
 */
const DEFAULT_TTL_SECONDS = 600;

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(payload: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function createDraftToken(
  secret: string,
  options: { ttlSeconds?: number; now?: number } = {},
): Promise<string> {
  const now = options.now ?? Date.now();
  const exp = now + (options.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000;
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({ exp })));
  const sig = b64urlEncode(await hmac(payload, secret));
  return `${payload}.${sig}`;
}

export async function verifyDraftToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts as [string, string];
  try {
    const expected = await hmac(payload, secret);
    if (!timingSafeEqual(b64urlDecode(sig), expected)) return false;
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as { exp?: number };
    return typeof data.exp === "number" && data.exp > now;
  } catch {
    return false;
  }
}
