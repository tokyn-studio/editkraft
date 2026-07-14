import { describe, expect, it, vi, beforeEach } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: (t: string) => revalidateTag(t) }));

// Import erst nach dem Mock
const { createRevalidateHandler } = await import("./revalidate");

beforeEach(() => revalidateTag.mockClear());

function post(body: unknown, opts: { secret?: string; header?: string } = {}) {
  const url = opts.secret ? `http://x/api?secret=${opts.secret}` : "http://x/api";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.header) headers["x-editkraft-secret"] = opts.header;
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
}

describe("createRevalidateHandler", () => {
  it("500 wenn kein Secret konfiguriert", async () => {
    const handler = createRevalidateHandler({});
    const res = await handler(post({ record: { slug: "a" } }, { header: "x" }));
    expect(res.status).toBe(500);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("401 bei falschem/fehlendem Secret", async () => {
    const handler = createRevalidateHandler({ secret: "geheim" });
    expect((await handler(post({}, { header: "falsch" }))).status).toBe(401);
    expect((await handler(post({}))).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("revalidiert den Seiten-Tag bei korrektem Secret (Header)", async () => {
    const handler = createRevalidateHandler({ secret: "geheim" });
    const res = await handler(post({ record: { slug: "start" } }, { header: "geheim" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revalidated: true, slugs: ["start"] });
    expect(revalidateTag).toHaveBeenCalledWith("editkraft:page:start");
  });

  it("akzeptiert das Secret auch als Query-Parameter", async () => {
    const handler = createRevalidateHandler({ secret: "geheim" });
    const res = await handler(post({ record: { slug: "x" } }, { secret: "geheim" }));
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("editkraft:page:x");
  });

  it("dedupliziert record/old_record slugs", async () => {
    const handler = createRevalidateHandler({ secret: "s" });
    await handler(post({ record: { slug: "a" }, old_record: { slug: "b" } }, { header: "s" }));
    expect(revalidateTag).toHaveBeenCalledWith("editkraft:page:a");
    expect(revalidateTag).toHaveBeenCalledWith("editkraft:page:b");
    expect(revalidateTag).toHaveBeenCalledTimes(2);
  });

  it("custom resolveSlugs wird genutzt", async () => {
    const handler = createRevalidateHandler({
      secret: "s",
      resolveSlugs: () => ["custom"],
    });
    await handler(post({}, { header: "s" }));
    expect(revalidateTag).toHaveBeenCalledWith("editkraft:page:custom");
  });
});

describe("Globals-Revalidate", () => {
  it("Payload { globals: true } invalidiert den Globals-Tag", async () => {
    const handler = createRevalidateHandler({ secret: "s3cret" });
    const res = await handler(post({ globals: true }, { header: "s3cret" }));
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("editkraft:globals");
  });

  it("Slugs und Globals zusammen: beide Tags werden invalidiert", async () => {
    const handler = createRevalidateHandler({ secret: "s3cret" });
    await handler(post({ record: { slug: "start" }, globals: true }, { header: "s3cret" }));
    expect(revalidateTag).toHaveBeenCalledWith("editkraft:page:start");
    expect(revalidateTag).toHaveBeenCalledWith("editkraft:globals");
  });

  it("ohne globals-Flag wird der Globals-Tag NICHT invalidiert", async () => {
    const handler = createRevalidateHandler({ secret: "s3cret" });
    await handler(post({ record: { slug: "start" } }, { header: "s3cret" }));
    expect(revalidateTag).not.toHaveBeenCalledWith("editkraft:globals");
  });
});
