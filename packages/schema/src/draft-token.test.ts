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
