/**
 * Kanonischer Rich-Text-Sanitizer (Teil des Contracts). Von Renderer (Ausgabe)
 * UND Inline-Editor (Eingabe-Normalisierung) genutzt, damit beide konsistent
 * bleiben. Dependency-frei und node-tauglich (kein DOMParser).
 *
 * Sicherheitsmodell: Tags werden NICHT durchgereicht, sondern aus einer festen
 * Allowlist neu aufgebaut; nur <a href> mit sicherem Protokoll überlebt, alle
 * anderen Attribute fallen weg. Text wird HTML-escaped. <script>/<style> werden
 * inkl. Inhalt entfernt. Ausgabe ist idempotent.
 */

export const RICH_TEXT_ALLOWLIST = {
  strong: [],
  em: [],
  a: ["href"],
} as const;

const TAG_ALIASES: Record<string, string> = { b: "strong", i: "em" };
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/)/i;

/** Escapt Text-Knoten. Entity-bewusst bei `&`, damit die Funktion idempotent bleibt. */
function escapeText(s: string): string {
  return s
    .replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#\d+;|#x[0-9a-fA-F]+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#\d+;|#x[0-9a-fA-F]+;)/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractHref(attrs: string): string | null {
  const m = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  if (!m) return null;
  const href = m[2] || m[3] || m[4];
  return href || null;
}

export function sanitizeRichText(input: string): string {
  if (!input) return "";
  // 1. script/style inkl. Inhalt entfernen.
  const cleaned = input.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");

  // 2. Tokenisieren und Allowlist-Tags neu aufbauen.
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  const open: string[] = [];
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(cleaned)) !== null) {
    out += escapeText(cleaned.slice(last, m.index));
    last = tagRe.lastIndex;

    const isClose = m[0][1] === "/";
    const tagName = m[1]!.toLowerCase();
    const name = TAG_ALIASES[tagName] ?? tagName;
    if (!(name in RICH_TEXT_ALLOWLIST)) continue; // unbekanntes Tag: droppen, Text bleibt

    if (isClose) {
      const idx = open.lastIndexOf(name);
      if (idx !== -1) {
        out += `</${name}>`;
        open.splice(idx, 1);
      }
      continue;
    }

    if (name === "a") {
      const href = extractHref(m[2]!);
      if (href && SAFE_HREF.test(href)) {
        out += `<a href="${escapeAttr(href)}">`;
        open.push("a");
      }
      // ungültiger/fehlender href: Link-Wrapper droppen, Text bleibt
      continue;
    }

    out += `<${name}>`;
    open.push(name);
  }

  out += escapeText(cleaned.slice(last));
  for (let k = open.length - 1; k >= 0; k--) out += `</${open[k]}>`;
  return out;
}
