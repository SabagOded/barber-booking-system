import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { LocalMediaStorage } from "./localStorage";
import { isSafeMediaStorageKey, publicMediaUrl } from "./storage";

const KEY = "portfolio/00000000-0000-4000-8000-000000000000.webp";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("local media storage", () => {
  it("writes, reads, resolves and deletes one exact generated key", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "appointment-media-"));
    roots.push(root);
    const storage = new LocalMediaStorage(root);
    const body = new Uint8Array([1, 2, 3]);

    await storage.save(KEY, body, "image/webp");
    expect(await storage.read(KEY)).toMatchObject({ contentType: "image/webp" });
    expect([...((await storage.read(KEY))?.body ?? [])]).toEqual([1, 2, 3]);
    expect(storage.resolvePublicUrl(KEY)).toBe(`/media/${KEY}`);
    expect([...await readFile(path.join(root, ...KEY.split("/")))]).toEqual([1, 2, 3]);

    await storage.delete(KEY);
    expect(await storage.read(KEY)).toBeNull();
  });

  it("rejects traversal and unrelated filenames", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "appointment-media-"));
    roots.push(root);
    const storage = new LocalMediaStorage(root);

    expect(isSafeMediaStorageKey("../../secret.webp")).toBe(false);
    expect(isSafeMediaStorageKey("portfolio/not-generated.webp")).toBe(false);
    expect(() => publicMediaUrl("../../secret.webp")).toThrow();
    await expect(storage.delete("../../secret.webp")).rejects.toThrow();
  });
});
