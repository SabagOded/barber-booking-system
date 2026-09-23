export type StoredMediaObject = {
  body: Buffer;
  contentType: string;
};

export interface MediaStorage {
  save(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  resolvePublicUrl(key: string): string;
}

export interface ReadableMediaStorage extends MediaStorage {
  read(key: string): Promise<StoredMediaObject | null>;
}

let storage: ReadableMediaStorage | undefined;

export async function getMediaStorage(): Promise<ReadableMediaStorage> {
  if (!storage) {
    const { LocalMediaStorage } = await import("./localStorage");
    storage = new LocalMediaStorage();
  }
  return storage;
}

export function isSafeMediaStorageKey(key: string): boolean {
  return /^(?:logo|portfolio)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i.test(
    key,
  );
}

export function publicMediaUrl(key: string): string {
  if (!isSafeMediaStorageKey(key)) {
    throw new Error("Invalid media storage key");
  }
  return `/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}
