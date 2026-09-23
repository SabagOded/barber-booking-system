import { File } from "node:buffer";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, type SessionCookieStore } from "../adminSession";
import { prisma } from "../prisma";
import { MAX_SOURCE_IMAGE_BYTES } from "./imageProcessing";
import {
  removeLogoAuthed,
  removePortfolioImageAuthed,
  saveLogoDisplaySizeAuthed,
  savePortfolioFocalPositionAuthed,
  uploadLogoAuthed,
  uploadPortfolioImageAuthed,
} from "./shopMedia";
import type { MediaStorage } from "./storage";
import { prepareTestDb, resetTestDb } from "@/test/resetTestDb";

class MemoryStorage implements MediaStorage {
  objects = new Map<string, Uint8Array>();
  failDelete = false;

  async save(key: string, body: Uint8Array) {
    this.objects.set(key, body);
  }
  async delete(key: string) {
    if (this.failDelete) throw new Error("delete failed");
    this.objects.delete(key);
  }
  resolvePublicUrl(key: string) {
    return `/media/${key}`;
  }
}

function memoryCookies(): SessionCookieStore {
  const values = new Map<string, string>();
  return {
    get(name) {
      const value = values.get(name);
      return value === undefined ? undefined : { value };
    },
    set(name, value) {
      values.set(name, value);
    },
    delete(name) {
      values.delete(name);
    },
  };
}

async function authedCookies() {
  const store = memoryCookies();
  await createSession(store);
  return store;
}

type TestImageMime =
  | "image/png"
  | "image/jpeg"
  | "image/jpg"
  | "image/pjpeg"
  | "image/webp";

async function imageFile(type: TestImageMime = "image/png") {
  const format = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpeg";
  const body = await sharp({
    create: { width: 20, height: 12, channels: 4, background: { r: 190, g: 140, b: 60, alpha: 1 } },
  })[format]().toBuffer();
  return new File([body], `test.${format}`, { type });
}

async function seedSettings() {
  await prisma.settings.create({
    data: {
      id: 1,
      businessName: "Test shop",
      providerName: "Test provider",
      phone: "0500000000",
      whatsappPhone: "972500000000",
    },
  });
}

describe("authenticated shop media", () => {
  beforeAll(prepareTestDb);
  beforeEach(async () => {
    await resetTestDb();
    await seedSettings();
  });
  afterEach(resetTestDb);
  afterAll(async () => prisma.$disconnect());

  it("blocks both uploads in demo mode before storage writes and keeps normal uploads available", async () => {
    const previous = process.env.DEMO_MODE;
    const store = await authedCookies();
    const storage = new MemoryStorage();
    const file = await imageFile();
    try {
      process.env.DEMO_MODE = "true";
      expect(await uploadLogoAuthed(store, file, storage)).toMatchObject({ ok: false, code: "demo_disabled", error: expect.stringContaining("דמו") });
      expect(await uploadPortfolioImageAuthed(store, file, storage)).toMatchObject({ ok: false, code: "demo_disabled" });
      expect(storage.objects.size).toBe(0);
      expect(await prisma.portfolioImage.count()).toBe(0);
      process.env.DEMO_MODE = "false";
      expect(await uploadLogoAuthed(store, file, storage)).toMatchObject({ ok: true });
      expect(await uploadPortfolioImageAuthed(store, file, storage)).toMatchObject({ ok: true });
      expect(storage.objects.size).toBe(2);
    } finally {
      if (previous === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = previous;
    }
  });

  it("rejects media writes without an admin session", async () => {
    const storage = new MemoryStorage();
    const file = await imageFile();
    expect(await uploadLogoAuthed(memoryCookies(), file, storage)).toMatchObject({
      ok: false,
      code: "unauthenticated",
    });
    expect(await uploadPortfolioImageAuthed(memoryCookies(), file, storage)).toMatchObject({
      ok: false,
      code: "unauthenticated",
    });
    expect(storage.objects.size).toBe(0);
    expect(await prisma.portfolioImage.count()).toBe(0);
  });

  it("validates type, decoded format and the exact 15 MiB source limit", async () => {
    const store = await authedCookies();
    const storage = new MemoryStorage();
    const png = await imageFile("image/png");
    const spoofed = new File([Buffer.from(await png.arrayBuffer())], "fake.jpg", {
      type: "image/jpeg",
    });
    const oversized = {
      size: MAX_SOURCE_IMAGE_BYTES + 1,
      type: "image/png",
      async arrayBuffer() {
        return new ArrayBuffer(0);
      },
    };

    expect(await uploadLogoAuthed(store, new File(["text"], "x.txt", { type: "text/plain" }), storage)).toMatchObject({ ok: false, code: "invalid" });
    expect(await uploadLogoAuthed(store, spoofed, storage)).toMatchObject({ ok: false, code: "invalid" });
    expect(await uploadLogoAuthed(store, oversized, storage)).toMatchObject({ ok: false, code: "invalid" });
    expect(storage.objects.size).toBe(0);
  });

  it.each(["image/jpeg", "image/jpg", "image/pjpeg"] as const)(
    "accepts %s and validates its decoded JPEG format",
    async (type) => {
      const store = await authedCookies();
      const storage = new MemoryStorage();

      expect(await uploadPortfolioImageAuthed(store, await imageFile(type), storage)).toMatchObject({
        ok: true,
      });
      expect(storage.objects.size).toBe(1);
    },
  );

  it("adds and removes a logo without allowing replacement", async () => {
    const store = await authedCookies();
    const storage = new MemoryStorage();
    const first = await uploadLogoAuthed(store, await imageFile(), storage);
    expect(first.ok).toBe(true);
    expect((await prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).logoStorageKey).toMatch(/^logo\//);
    expect(storage.objects.size).toBe(1);

    expect(await uploadLogoAuthed(store, await imageFile(), storage)).toMatchObject({ ok: false, code: "invalid" });
    expect(storage.objects.size).toBe(1);
    expect(await removeLogoAuthed(store, storage)).toMatchObject({ ok: true, logoUrl: null });
    expect((await prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).logoStorageKey).toBeNull();
    expect(storage.objects.size).toBe(0);
  });

  it("defaults the logo display size to medium and persists only supported values", async () => {
    const store = await authedCookies();
    expect(
      (await prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).logoDisplaySize,
    ).toBe("medium");

    expect(await saveLogoDisplaySizeAuthed(store, "large")).toEqual({
      ok: true,
      logoDisplaySize: "large",
    });
    expect(
      (await prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).logoDisplaySize,
    ).toBe("large");

    expect(await saveLogoDisplaySizeAuthed(store, "oversized")).toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(
      (await prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).logoDisplaySize,
    ).toBe("large");
  });

  it("hard-limits the portfolio to five and persists focal position", async () => {
    const store = await authedCookies();
    const storage = new MemoryStorage();
    for (let index = 0; index < 5; index += 1) {
      expect((await uploadPortfolioImageAuthed(store, await imageFile(), storage)).ok).toBe(true);
    }
    expect(await uploadPortfolioImageAuthed(store, await imageFile(), storage)).toMatchObject({ ok: false, code: "invalid" });
    expect(await prisma.portfolioImage.count()).toBe(5);
    expect(storage.objects.size).toBe(5);

    const image = await prisma.portfolioImage.findFirstOrThrow();
    expect(await savePortfolioFocalPositionAuthed(store, image.id, 12.5, 87.5)).toEqual({ ok: true });
    expect(await prisma.portfolioImage.findUniqueOrThrow({ where: { id: image.id } })).toMatchObject({ focalX: 12.5, focalY: 87.5 });
    expect(await savePortfolioFocalPositionAuthed(store, image.id, -1, 50)).toMatchObject({ ok: false, code: "invalid" });

    expect(await removePortfolioImageAuthed(store, image.id, storage)).toMatchObject({ ok: true });
    expect(await prisma.portfolioImage.count()).toBe(4);
    expect(storage.objects.size).toBe(4);
  });

  it("keeps product state clear and reports a storage deletion failure", async () => {
    const store = await authedCookies();
    const storage = new MemoryStorage();
    const uploaded = await uploadPortfolioImageAuthed(store, await imageFile(), storage);
    if (!uploaded.ok || !uploaded.image) throw new Error("upload failed");
    storage.failDelete = true;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await removePortfolioImageAuthed(store, uploaded.image.id, storage)).toMatchObject({ ok: true, warning: expect.any(String) });
    expect(await prisma.portfolioImage.count()).toBe(0);
    expect(storage.objects.size).toBe(1);
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});
