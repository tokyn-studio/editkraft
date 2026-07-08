# Editor Contract Foundation – Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erweitere den OSS-Contract und die Preview so, dass das Studio die Block-Feld-Deskriptoren erhält (`ek:schema`) und die Preview cookie-frei über ein signiertes Draft-Token in den Draft Mode kommt.

**Versionsziele:** `@editkraft/schema` 0.1.0 → **0.2.0** (minor), `@editkraft/react` 0.2.1 → **0.3.0** (minor), `editkraft` 0.1.2 → **0.1.3** (patch).

**Architecture:** Neue postMessage-Nachricht `ek:schema` (Preview → Studio) trägt serialisierbare Block-Deskriptoren; `EditkraftPreview` sendet sie beim Mount aus `Registry.descriptors()`. Ein signiertes Draft-Token (HMAC-SHA256 via Web Crypto, in `@editkraft/schema`) ersetzt den Draft-Mode-Cookie in der CLI-generierten Preview-Route.

**Tech Stack:** TypeScript strict, ESM, tsup, Zod, Vitest (+ jsdom/Testing Library), Web Crypto (`globalThis.crypto.subtle`), Changesets.

## Global Constraints

- `@editkraft/schema` bleibt dependency-arm: **nur Zod** als Dependency. Das Draft-Token nutzt Web Crypto (`globalThis.crypto.subtle`), **kein** neues Package.
- TypeScript strict, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`. Optionale Objekt-Properties, die `undefined` sein können, explizit als `| undefined` typisieren.
- ESM-first; Builds via tsup (ESM + CJS + d.ts). Client-Bundle (`preview`) behält `"use client"` (bestehende tsup-Config).
- Protokoll-Ergänzungen sind **rückwärtskompatibel** → **Minor**-Release. `parseMessage` gibt bei unbekannten Typen weiterhin `null` zurück.
- Node ≥ 20 (Web Crypto global vorhanden). Tests laufen unter Node 22 (CI).
- Conventional Commits; kein Commit mit rotem Test oder TS-Fehler. Jede Paketänderung braucht einen Changeset.
- Alle Pfade sind relativ zu `editkraft.public/`.

---

### Task 1: `BlockSchemaDescriptor` + `ek:schema`-Nachricht im Contract

**Files:**
- Modify: `packages/schema/src/protocol.ts`
- Modify: `packages/schema/src/protocol.test.ts`
- Modify: `packages/schema/src/index.ts`

**Interfaces:**
- Consumes: `BlockFieldDescriptor` aus `./block`, `PROTOCOL_CHANNEL`/`PROTOCOL_VERSION` aus `./protocol`.
- Produces:
  - Type `BlockSchemaDescriptor = { type: string; label: string; slots: string[]; fields: BlockFieldDescriptor[] }`
  - `ekSchemaMessage` (Zod), Member der `ekMessage`-Union, Typ `EkSchemaMessage`.
  - `createMessage("ek:schema", { blocks })` funktioniert.

- [ ] **Step 1: Failing test** — ergänze in `packages/schema/src/protocol.test.ts`:

```ts
import { ekMessage, createMessage, parseMessage } from "./protocol";

describe("ek:schema", () => {
  const blocks = [
    { type: "Hero", label: "Hero", slots: [], fields: [{ kind: "text", key: "headline", optional: false }] },
  ];

  it("ist ein gültiger Message-Typ", () => {
    const msg = createMessage("ek:schema", { blocks });
    expect(ekMessage.safeParse(msg).success).toBe(true);
    expect(parseMessage(msg)?.type).toBe("ek:schema");
  });

  it("verlangt type/label/slots/fields je Block", () => {
    const bad = createMessage("ek:schema", { blocks: [{ type: "X" }] as never });
    expect(ekMessage.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @editkraft/schema test -- protocol`
Expected: FAIL (kein `ek:schema` in der Union → `createMessage` bzw. parse schlägt fehl / TS-Fehler).

- [ ] **Step 3: Implement** — in `packages/schema/src/protocol.ts` oberhalb von `ekMessage` einfügen und die Union erweitern:

```ts
import type { BlockFieldDescriptor } from "./block";

export type BlockSchemaDescriptor = {
  type: string;
  label: string;
  slots: string[];
  fields: BlockFieldDescriptor[];
};

const blockFieldDescriptorSchema = z
  .object({
    kind: z.enum(["text", "richText", "image", "link", "color", "list", "reference"]),
    key: z.string(),
    optional: z.boolean(),
  })
  .passthrough(); // label, to, item etc. werden mitgeführt

const blockSchemaDescriptorSchema = z.object({
  type: z.string(),
  label: z.string(),
  slots: z.array(z.string()),
  fields: z.array(blockFieldDescriptorSchema),
});

/** Preview → Studio: verfügbare Blöcke samt Feld-Deskriptoren (für die Formulare). */
export const ekSchemaMessage = z.object({
  ...base,
  type: z.literal("ek:schema"),
  blocks: z.array(blockSchemaDescriptorSchema),
});
export type EkSchemaMessage = z.infer<typeof ekSchemaMessage>;
```

Dann `ekMessage` erweitern:

```ts
export const ekMessage = z.discriminatedUnion("type", [
  ekReadyMessage,
  ekSelectMessage,
  ekUpdateMessage,
  ekTreeMessage,
  ekSchemaMessage,
]);
```

- [ ] **Step 4: Export** — in `packages/schema/src/index.ts` im protocol-Export ergänzen: `ekSchemaMessage`, `type EkSchemaMessage`, `type BlockSchemaDescriptor`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @editkraft/schema test -- protocol` → Expected: PASS
Run: `pnpm --filter @editkraft/schema typecheck` → Expected: keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/protocol.ts packages/schema/src/protocol.test.ts packages/schema/src/index.ts
git commit -m "feat(schema): add ek:schema protocol message with block descriptors"
```

---

### Task 2: `Registry.descriptors()` im Renderer

**Files:**
- Modify: `packages/react/src/registry.ts`
- Modify: `packages/react/src/registry.test.ts`

**Interfaces:**
- Consumes: `BlockSchemaDescriptor` aus `@editkraft/schema`, `RegistryEntry.definition.{type,label,slots,fields}`.
- Produces: `Registry.descriptors(): BlockSchemaDescriptor[]`.

- [ ] **Step 1: Failing test** — in `packages/react/src/registry.test.ts` ergänzen:

```ts
it("descriptors() liefert serialisierbare Block-Deskriptoren", () => {
  const reg = createRegistry([{ definition: heroDef, component: Comp }]);
  const d = reg.descriptors();
  expect(d).toEqual([
    { type: "Hero", label: "Hero", slots: [], fields: heroDef.fields },
  ]);
  // vollständig serialisierbar (keine Funktionen)
  expect(() => JSON.stringify(d)).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @editkraft/react test -- registry`
Expected: FAIL (`reg.descriptors is not a function`).

- [ ] **Step 3: Implement** — in `packages/react/src/registry.ts`:

Import ergänzen:
```ts
import type { BlockDefinition, BlockSchemaDescriptor } from "@editkraft/schema";
```
Im `Registry`-Interface ergänzen:
```ts
  descriptors(): BlockSchemaDescriptor[];
```
Im `return`-Objekt von `createRegistry` ergänzen:
```ts
    descriptors: () =>
      [...map.values()].map((e) => ({
        type: e.definition.type,
        label: e.definition.label,
        slots: e.definition.slots,
        fields: e.definition.fields,
      })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @editkraft/react test -- registry` → PASS
Run: `pnpm --filter @editkraft/react typecheck` → keine Fehler.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/registry.ts packages/react/src/registry.test.ts
git commit -m "feat(react): Registry.descriptors() for serializable block schemas"
```

---

### Task 3: `EditkraftPreview` sendet `ek:schema` beim Mount

**Files:**
- Modify: `packages/react/src/preview.tsx`
- Modify: `packages/react/src/preview.test.tsx`

**Interfaces:**
- Consumes: `createMessage`, `Registry.descriptors()`.
- Produces: Beim Mount wird zusätzlich `ek:schema` an `window.parent` (Ziel `studioOrigin`) gesendet.

- [ ] **Step 1: Failing test** — in `packages/react/src/preview.test.tsx` ergänzen:

```ts
it("sendet ek:schema mit den Block-Deskriptoren beim Mount", () => {
  const post = vi.spyOn(window.parent, "postMessage");
  render(<EditkraftPreview content={content} registry={registry} studioOrigin={STUDIO} />);
  const schema = post.mock.calls.map((c) => c[0] as { type: string; blocks?: unknown[] }).find((m) => m.type === "ek:schema");
  expect(schema).toBeTruthy();
  expect(schema!.blocks!.length).toBeGreaterThan(0);
  post.mockRestore();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @editkraft/react test -- preview`
Expected: FAIL (kein `ek:schema` gesendet).

- [ ] **Step 3: Implement** — in `packages/react/src/preview.tsx` im `useEffect` direkt nach dem `ek:ready`-Post einfügen:

```ts
    postToStudio(createMessage("ek:schema", { blocks: registry.descriptors() }), studioOrigin);
```

(`registry` ist bereits eine Prop von `EditkraftPreview`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @editkraft/react test -- preview` → PASS (alle bisherigen Preview-Tests bleiben grün).

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/preview.tsx packages/react/src/preview.test.tsx
git commit -m "feat(react): EditkraftPreview emits ek:schema on mount"
```

---

### Task 4: Draft-Token (signieren/prüfen) in `@editkraft/schema`

**Files:**
- Create: `packages/schema/src/draft-token.ts`
- Create: `packages/schema/src/draft-token.test.ts`
- Modify: `packages/schema/src/index.ts`

**Interfaces:**
- Produces:
  - `createDraftToken(secret: string, options?: { ttlSeconds?: number; now?: number }): Promise<string>`
  - `verifyDraftToken(token: string, secret: string, now?: number): Promise<boolean>`
- Token-Format: `base64url(JSON.stringify({ exp })) + "." + base64url(hmacSha256(payloadPart, secret))`. `exp` ist Ablauf in epoch-ms.

- [ ] **Step 1: Failing test** — `packages/schema/src/draft-token.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDraftToken, verifyDraftToken } from "./draft-token";

const SECRET = "preview-shared-secret-123";
const NOW = 1_800_000_000_000;

describe("draft-token", () => {
  it("Roundtrip: signiertes Token verifiziert", async () => {
    const t = await createDraftToken(SECRET, { ttlSeconds: 300, now: NOW });
    expect(await verifyDraftToken(t, SECRET, NOW + 1000)).toBe(true);
  });

  it("abgelaufenes Token wird abgelehnt", async () => {
    const t = await createDraftToken(SECRET, { ttlSeconds: 60, now: NOW });
    expect(await verifyDraftToken(t, SECRET, NOW + 61_000)).toBe(false);
  });

  it("falsches Secret wird abgelehnt", async () => {
    const t = await createDraftToken(SECRET, { now: NOW });
    expect(await verifyDraftToken(t, "anderes-secret", NOW + 1000)).toBe(false);
  });

  it("manipuliertes Token wird abgelehnt", async () => {
    const t = await createDraftToken(SECRET, { now: NOW });
    const tampered = t.slice(0, -2) + (t.endsWith("AA") ? "BB" : "AA");
    expect(await verifyDraftToken(tampered, SECRET, NOW + 1000)).toBe(false);
  });

  it("Unsinn wird abgelehnt (kein Throw)", async () => {
    expect(await verifyDraftToken("kein.token", SECRET, NOW)).toBe(false);
    expect(await verifyDraftToken("", SECRET, NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @editkraft/schema test -- draft-token`
Expected: FAIL (Modul existiert nicht).

- [ ] **Step 3: Implement** — `packages/schema/src/draft-token.ts`:

```ts
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
```

- [ ] **Step 4: Export** — in `packages/schema/src/index.ts` ergänzen:

```ts
export { createDraftToken, verifyDraftToken } from "./draft-token";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @editkraft/schema test -- draft-token` → PASS
Run: `pnpm --filter @editkraft/schema build` → Build grün (ESM+CJS+d.ts).

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/draft-token.ts packages/schema/src/draft-token.test.ts packages/schema/src/index.ts
git commit -m "feat(schema): signed draft token (HMAC) for cookie-free preview"
```

---

### Task 5: CLI-Preview-Route auf Draft-Token umstellen + Beispiel-App anpassen

**Files:**
- Modify: `packages/cli/src/templates/project.ts`
- Modify: `packages/cli/src/templates/migration.ts` (kein Change) — nur zur Info, nicht anfassen.
- Modify: `packages/cli/src/generate.test.ts` (Snapshot wird aktualisiert)
- Modify: `apps/example/app/editkraft/preview/[[...slug]]/page.tsx`
- Modify: `apps/example/app/editkraft/draft/route.ts` → **löschen** (Draft-Toggle entfällt)
- Modify: `apps/example/public/fake-studio.html`

**Interfaces:**
- Consumes: `verifyDraftToken` aus `@editkraft/schema`.
- Produces: Preview-Route lädt Draft-Content, wenn `?token=<gültig>` vorhanden ist (statt Draft-Mode-Cookie). Neue ENV `EDITKRAFT_PREVIEW_SECRET`.

- [ ] **Step 1: Failing test** — in `packages/cli/src/generate.test.ts` die Migrations-/RLS-Assertion belassen und eine neue Prüfung ergänzen:

```ts
it("Preview-Route nutzt Draft-Token statt Draft-Mode-Cookie", () => {
  const files = Object.fromEntries(
    generateFiles({ srcDir: false, timestamp: "20260101000000" }).map((f) => [f.path, f.content]),
  );
  const preview = files["app/editkraft/preview/[[...slug]]/page.tsx"]!;
  expect(preview).toContain("verifyDraftToken");
  expect(preview).not.toContain("draftMode");
  const env = files[".env.editkraft.example"]!;
  expect(env).toContain("EDITKRAFT_PREVIEW_SECRET");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter editkraft test -- generate`
Expected: FAIL (`draftMode` noch enthalten, `verifyDraftToken`/`EDITKRAFT_PREVIEW_SECRET` fehlen).

- [ ] **Step 3: Implement** — in `packages/cli/src/templates/project.ts` die Funktion `previewRoute()` ersetzen durch:

```ts
export function previewRoute(): string {
  return `import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { loadDraftContent } from "@editkraft/react";
import { verifyDraftToken } from "@editkraft/schema";
import { PreviewClient } from "../preview-client";

/**
 * Preview-Route für das Studio. Zugriff über ein signiertes, kurzlebiges
 * Draft-Token (?token=…) statt Draft-Mode-Cookie – funktioniert damit auch im
 * Cross-Origin-iframe. Lädt Draft-Content serverseitig (Service-Key) und
 * übergibt nur den serialisierbaren Content an den Client-Wrapper.
 */
export default async function EditkraftPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const secret = process.env.EDITKRAFT_PREVIEW_SECRET;
  if (!secret || !token || !(await verifyDraftToken(token, secret))) notFound();

  const { slug } = await params;
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const page = await loadDraftContent(supabase, slug?.join("/") ?? "");
  if (!page) notFound();

  return (
    <PreviewClient
      content={page.content}
      studioOrigin={process.env.NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN ?? ""}
    />
  );
}
`;
}
```

In derselben Datei `envExample()` erweitern: die Zeile mit `NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN` beibehalten und darüber einfügen:

```
# Shared Secret für signierte Draft-Preview-Tokens (Studio ⇄ Kundenseite)
EDITKRAFT_PREVIEW_SECRET=
```

(D. h. im Template-String von `envExample()` eine weitere Zeile ergänzen.)

- [ ] **Step 4: Beispiel-App angleichen**

`apps/example/app/editkraft/draft/route.ts` löschen:
```bash
git rm apps/example/app/editkraft/draft/route.ts
```

`apps/example/app/editkraft/preview/[[...slug]]/page.tsx` ersetzen durch dieselbe Logik wie das Template (Token statt draftMode):
```tsx
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { loadDraftContent } from "@editkraft/react";
import { verifyDraftToken } from "@editkraft/schema";
import { PreviewClient } from "../preview-client";

export const dynamic = "force-dynamic";

export default async function EditkraftPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const secret = process.env.EDITKRAFT_PREVIEW_SECRET;
  if (!secret || !token || !(await verifyDraftToken(token, secret))) notFound();

  const { slug } = await params;
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const page = await loadDraftContent(supabase, slug?.join("/") ?? "start");
  if (!page) notFound();
  return (
    <PreviewClient content={page.content} studioOrigin={process.env.NEXT_PUBLIC_EDITKRAFT_STUDIO_ORIGIN ?? ""} />
  );
}
```

In `apps/example/public/fake-studio.html` das Default-`previewUrl`-Input auf einen Token-Platzhalter setzen (der echte Token kommt später vom Studio):
```html
<input id="previewUrl" size="40" value="http://localhost:3000/editkraft/preview/start?token=PASTE_TOKEN" />
```

- [ ] **Step 5: Snapshot + Tests aktualisieren**

Run: `pnpm --filter editkraft build && pnpm --filter editkraft test -u`
Expected: Snapshot aktualisiert, alle CLI-Tests grün (inkl. der neuen Assertion aus Step 1).

- [ ] **Step 6: Commit**

```bash
git add packages/cli apps/example
git commit -m "feat(cli): token-gated preview route (cookie-free); update example"
```

---

### Task 6: Changesets, Build/Test, Release

**Files:**
- Create: `.changeset/editor-contract.md`
- Modify: (durch `changeset version`) `packages/*/package.json`, `packages/*/CHANGELOG.md`

**Interfaces:** keine Code-Interfaces; produziert veröffentlichte Paketversionen.

- [ ] **Step 1: Changeset schreiben** — `.changeset/editor-contract.md`:

```markdown
---
"@editkraft/schema": minor
"@editkraft/react": minor
"editkraft": patch
---

Editor-Fundament: neue postMessage-Nachricht `ek:schema` (Preview liefert die
Block-Feld-Deskriptoren ans Studio), `Registry.descriptors()`, `EditkraftPreview`
sendet das Schema beim Mount. Neues signiertes Draft-Token (`createDraftToken`/
`verifyDraftToken`, HMAC via Web Crypto) für cookie-freie Preview; `editkraft init`
generiert die Preview-Route jetzt token-gegated (ENV `EDITKRAFT_PREVIEW_SECRET`).
```

- [ ] **Step 2: Volle Pipeline grün**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: alle Tasks erfolgreich, alle Tests grün.

- [ ] **Step 3: Versionen erzeugen**

Run: `pnpm exec changeset version`
Expected: `@editkraft/schema` → **0.2.0**, `@editkraft/react` → **0.3.0**, `editkraft` → **0.1.3**; CHANGELOGs aktualisiert; Changeset konsumiert.

- [ ] **Step 4: Commit + Push (Release-Workflow publiziert)**

```bash
git add -A
git commit -m "chore: version packages (editor contract foundation)"
git push
```

Expected: Release-Workflow auf `main` grün; `npm view @editkraft/schema version` zeigt `0.3.0`.

- [ ] **Step 5: Publish verifizieren**

Run (nach ~1 Min): `npm view @editkraft/schema version && npm view @editkraft/react version && npm view editkraft version`
Expected: neue Versionen sichtbar.

---

## Self-Review

- **Spec-Coverage:** `ek:schema` (Task 1–3) ✓, Draft-Token gegen Cross-Origin-Cookie (Task 4–5) ✓, CLI-Preview token-gegated (Task 5) ✓, Release/Cross-Repo-Vorarbeit (Task 6) ✓. Die Studio-seitigen Punkte (Editor-UI, Save, Secret-Speicherung, `@editkraft/schema` einbinden) sind bewusst **Plan 2**.
- **Placeholder-Scan:** keine TBD/TODO; alle Steps mit konkretem Code/Command.
- **Typkonsistenz:** `BlockSchemaDescriptor` (Task 1) = Rückgabe von `Registry.descriptors()` (Task 2) = `blocks` in `ek:schema` (Task 3). `createDraftToken`/`verifyDraftToken`-Signaturen konsistent zwischen Task 4 und Task 5.

## Danach

Nach Merge/Release von Plan 1 schreibe ich **Plan 2 (Studio-Editor)** – dieser konsumiert `@editkraft/schema@0.2.0` (`link:` in der Entwicklung), baut Editor-Route, Bridge-Client, Formular-Generator, Save via DataPlaneClient und die Draft-Token-Erzeugung inkl. Preview-Secret-Speicherung pro Site.
