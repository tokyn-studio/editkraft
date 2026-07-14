import { describe, expect, it } from "vitest";
import {
  pageStatusSchema,
  pageMetaSchema,
  ekPageRowSchema,
  ekPageVersionRowSchema,
  ekAssetRowSchema,
  ekGlobalsRowSchema,
  EK_ASSETS_BUCKET,
} from "./rows";

const uuid = "00000000-0000-4000-8000-000000000000";

describe("DB-Row-Schemas", () => {
  it("pageStatus kennt draft und published", () => {
    expect(pageStatusSchema.options).toEqual(["draft", "published"]);
  });

  it("pageMeta erlaubt bekannte Felder und lässt Zusätzliches durch", () => {
    const parsed = pageMetaSchema.parse({ title: "T", description: "D", extra: 1 });
    expect(parsed).toMatchObject({ title: "T", extra: 1 });
  });

  it("ekPageRow validiert eine Zeile und defaultet meta", () => {
    const row = ekPageRowSchema.parse({
      id: uuid,
      slug: "start",
      locale: "en",
      translation_group_id: uuid,
      title: "Startseite",
      status: "published",
      published_version_id: uuid,
      created_at: "2026-07-08T00:00:00Z",
      updated_at: "2026-07-08T00:00:00Z",
    });
    expect(row.meta).toEqual({});
    expect(row.status).toBe("published");
  });

  it("ekPageRow lehnt ungültige Status/UUIDs ab", () => {
    expect(
      ekPageRowSchema.safeParse({
        id: "not-uuid",
        slug: "x",
        title: "x",
        status: "archived",
        published_version_id: null,
        created_at: "x",
        updated_at: "x",
      }).success,
    ).toBe(false);
  });

  it("ekPageVersionRow validiert eingebetteten PageContent", () => {
    const ok = ekPageVersionRowSchema.safeParse({
      id: uuid,
      page_id: uuid,
      content: { schemaVersion: "0.1.0", blocks: [] },
      schema_version: "0.1.0",
      created_by: null,
      created_at: "2026-07-08T00:00:00Z",
    });
    expect(ok.success).toBe(true);
  });

  it("ekAssetRow validiert Assets", () => {
    const ok = ekAssetRowSchema.safeParse({
      id: uuid,
      storage_path: "ek-assets/x.png",
      alt: null,
      width: 800,
      height: 600,
      mime_type: "image/png",
    });
    expect(ok.success).toBe(true);
  });

  it("Asset-Bucket-Konstante", () => {
    expect(EK_ASSETS_BUCKET).toBe("ek-assets");
  });
});

describe("ekPageRowSchema locale contract", () => {
  const base = {
    id: "5f0f6a3e-1111-4222-8333-444455556666",
    slug: "home",
    title: "Home",
    meta: {},
    status: "published",
    published_version_id: null,
    created_at: "2026-07-10T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
  };

  it("accepts locale and translation_group_id", () => {
    const row = ekPageRowSchema.parse({
      ...base,
      locale: "de",
      translation_group_id: "5f0f6a3e-aaaa-4bbb-8ccc-444455556666",
    });
    expect(row.locale).toBe("de");
  });

  it("rejects a row without locale", () => {
    expect(() => ekPageRowSchema.parse(base)).toThrow();
  });

  it("rejects a single-character locale", () => {
    expect(() =>
      ekPageRowSchema.parse({
        ...base,
        locale: "a",
        translation_group_id: "5f0f6a3e-aaaa-4bbb-8ccc-444455556666",
      }),
    ).toThrow();
  });
});

describe("ekGlobalsRowSchema", () => {
  it("akzeptiert die Einzelzeile mit draft/published", () => {
    const row = ekGlobalsRowSchema.parse({
      id: 1,
      draft: { phone: "0176 1" },
      published: null,
      updated_at: "2026-07-14T10:00:00Z",
    });
    expect(row.draft).toEqual({ phone: "0176 1" });
    expect(row.published).toBeNull();
  });

  it("lehnt Nicht-Objekt-Werte in draft ab", () => {
    expect(() =>
      ekGlobalsRowSchema.parse({ id: 1, draft: "x", published: null, updated_at: "t" }),
    ).toThrow();
  });
});
