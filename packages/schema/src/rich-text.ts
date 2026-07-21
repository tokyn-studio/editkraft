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
  u: [],
  s: [],
  a: ["href", "target"],
  p: ["style"],
  h2: ["style"],
  h3: ["style"],
  ul: [],
  ol: [],
  li: ["style"],
  blockquote: ["style"],
  code: [],
  br: [],
  hr: [],
} as const;

/** Block-Tags, auf denen eine Textausrichtung erlaubt ist. */
const ALIGNABLE = new Set(["p", "h2", "h3", "li", "blockquote"]);
const ALIGN_VALUES = new Set(["left", "center", "right", "justify"]);

/**
 * Liest eine erlaubte Textausrichtung aus `style="text-align:…"` (styleWithCSS)
 * oder dem `align`-Attribut (Fallback älterer execCommand-Engines). Nur die vier
 * bekannten Werte überleben; der Wert wird NIE roh durchgereicht.
 */
function extractAlign(attrs: string): string | null {
  const style = extractAttr(attrs, "style");
  if (style) {
    const m = /text-align\s*:\s*([a-zA-Z]+)/.exec(style);
    if (m && ALIGN_VALUES.has(m[1]!.toLowerCase())) return m[1]!.toLowerCase();
  }
  const align = extractAttr(attrs, "align");
  if (align && ALIGN_VALUES.has(align.toLowerCase())) return align.toLowerCase();
  return null;
}

/** Void-Tags: werden ohne Schließtag neu aufgebaut (kein open-Stack-Eintrag). */
const VOID_TAGS = new Set(["br", "hr"]);

const TAG_ALIASES: Record<string, string> = {
  b: "strong",
  i: "em",
  strike: "s",
  del: "s",
};
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?![\/\\]))/i;

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

function extractAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(attrs);
  if (!m) return null;
  const value = m[2] || m[3] || m[4];
  return value || null;
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
      // Schließende Void-Tags (</br>) sind ungültig und werden verworfen.
      if (VOID_TAGS.has(name)) continue;
      const idx = open.lastIndexOf(name);
      if (idx !== -1) {
        out += `</${name}>`;
        open.splice(idx, 1);
      }
      continue;
    }

    if (VOID_TAGS.has(name)) {
      out += `<${name}>`;
      continue;
    }

    if (name === "a") {
      const href = extractAttr(m[2]!, "href");
      if (href && SAFE_HREF.test(href)) {
        // target überlebt NUR als "_blank" — und erzwingt dann
        // rel="noopener noreferrer". Ein geliefertes rel wird ignoriert:
        // Attribute werden neu aufgebaut, nie durchgereicht.
        const target = extractAttr(m[2]!, "target");
        const targetAttrs =
          target?.toLowerCase() === "_blank" ? ` target="_blank" rel="noopener noreferrer"` : "";
        out += `<a href="${escapeAttr(href)}"${targetAttrs}>`;
        open.push("a");
      }
      // ungültiger/fehlender href: Link-Wrapper droppen, Text bleibt
      continue;
    }

    if (ALIGNABLE.has(name)) {
      // Nur die Textausrichtung überlebt – als frisch gebautes, validiertes
      // `style="text-align:…"`. „left" ist Default und wird weggelassen.
      const align = extractAlign(m[2]!);
      const styleAttr = align && align !== "left" ? ` style="text-align:${align}"` : "";
      out += `<${name}${styleAttr}>`;
      open.push(name);
      continue;
    }

    out += `<${name}>`;
    open.push(name);
  }

  out += escapeText(cleaned.slice(last));
  for (let k = open.length - 1; k >= 0; k--) out += `</${open[k]}>`;
  return out;
}
