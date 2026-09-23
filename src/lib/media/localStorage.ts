import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isSafeMediaStorageKey,
  publicMediaUrl,
  type ReadableMediaStorage,
  type StoredMediaObject,
} from "./storage";

export class LocalMediaStorage implements ReadableMediaStorage {
  private readonly root: string;

  constructor(root = process.env.MEDIA_LOCAL_ROOT || path.join(process.cwd(), "uploads")) {
    this.root = path.resolve(root);
  }

  async save(key: string, body: Uint8Array, contentType: string): Promise<void> {
    if (contentType !== "image/webp") {
      throw new Error("Unsupported stored media type");
    }
    const target = this.pathFor(key);
    const directory = path.dirname(target);
    const temporary = path.join(directory, `.${path.basename(target)}.${randomUUID()}.tmp`);
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(temporary, body, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  resolvePublicUrl(key: string): string {
    return publicMediaUrl(key);
  }

  async read(key: string): Promise<StoredMediaObject | null> {
    try {
      return { body: await readFile(this.pathFor(key)), contentType: "image/webp" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  private pathFor(key: string): string {
    if (!isSafeMediaStorageKey(key)) {
      throw new Error("Invalid media storage key");
    }
    const target = path.resolve(this.root, ...key.split("/"));
    if (!target.startsWith(`${this.root}${path.sep}`)) {
      throw new Error("Media storage key escapes its root");
    }
    return target;
  }
}
