import { randomUUID } from "node:crypto";
import { loadProtectedAdmin, type SessionCookieStore } from "../adminSession";
import { prisma } from "../prisma";
import { ImageValidationError, optimizeUploadedImage } from "./imageProcessing";
import { LOGO_DISPLAY_SIZES, type LogoDisplaySize } from "./logoDisplay";
import { getMediaStorage, type MediaStorage } from "./storage";
import { isDemoMode } from "../demoMode";

const SETTINGS_ID = 1;
const MAX_PORTFOLIO_IMAGES = 5;

export type AdminMediaItem = {
  id: string;
  url: string;
  sortOrder: number;
  focalX: number;
  focalY: number;
};

export type MediaWriteResult =
  | {
      ok: true;
      warning?: string;
      logoUrl?: string | null;
      logoDisplaySize?: LogoDisplaySize;
      image?: AdminMediaItem;
    }
  | {
      ok: false;
      code: "unauthenticated" | "invalid" | "not_found" | "failed" | "demo_disabled";
      error: string;
    };

export async function uploadLogoAuthed(
  store: SessionCookieStore,
  file: unknown,
  storage?: MediaStorage,
): Promise<MediaWriteResult> {
  const gate = await requireAdmin(store);
  if (gate) return gate;
  if (isDemoMode()) return demoUploadDisabled();
  const adapter = storage ?? (await getMediaStorage());
  const settings = await prisma.settings.findUnique({
    where: { id: SETTINGS_ID },
    select: { logoStorageKey: true },
  });
  if (!settings) return notFound();
  if (settings.logoStorageKey) {
    return invalid("כדי להעלות לוגו חדש יש להסיר תחילה את הלוגו הקיים.");
  }

  const optimized = await validateAndOptimize(file, "logo");
  if (!optimized.ok) return optimized;
  const key = `logo/${randomUUID()}.webp`;
  await adapter.save(key, optimized.body, "image/webp");
  try {
    const updated = await prisma.settings.updateMany({
      where: { id: SETTINGS_ID, logoStorageKey: null },
      data: { logoStorageKey: key },
    });
    if (updated.count !== 1) {
      await cleanupNewObject(adapter, key);
      return invalid("כדי להעלות לוגו חדש יש להסיר תחילה את הלוגו הקיים.");
    }
    return { ok: true, logoUrl: adapter.resolvePublicUrl(key) };
  } catch (error) {
    await cleanupNewObject(adapter, key);
    throw error;
  }
}

export async function removeLogoAuthed(
  store: SessionCookieStore,
  storage?: MediaStorage,
): Promise<MediaWriteResult> {
  const gate = await requireAdmin(store);
  if (gate) return gate;
  const adapter = storage ?? (await getMediaStorage());
  const settings = await prisma.settings.findUnique({
    where: { id: SETTINGS_ID },
    select: { logoStorageKey: true },
  });
  if (!settings) return notFound();
  if (!settings.logoStorageKey) return { ok: true, logoUrl: null };

  const key = settings.logoStorageKey;
  await prisma.settings.updateMany({
    where: { id: SETTINGS_ID, logoStorageKey: key },
    data: { logoStorageKey: null },
  });
  const warning = await deleteStoredObject(adapter, key);
  return { ok: true, logoUrl: null, ...(warning ? { warning } : {}) };
}

export async function uploadPortfolioImageAuthed(
  store: SessionCookieStore,
  file: unknown,
  storage?: MediaStorage,
): Promise<MediaWriteResult> {
  const gate = await requireAdmin(store);
  if (gate) return gate;
  if (isDemoMode()) return demoUploadDisabled();
  const adapter = storage ?? (await getMediaStorage());
  if (await portfolioIsFull()) return portfolioLimit();

  const optimized = await validateAndOptimize(file, "portfolio");
  if (!optimized.ok) return optimized;
  const key = `portfolio/${randomUUID()}.webp`;
  await adapter.save(key, optimized.body, "image/webp");
  try {
    const image = await prisma.$transaction(async (tx) => {
      const count = await tx.portfolioImage.count({ where: { settingsId: SETTINGS_ID } });
      if (count >= MAX_PORTFOLIO_IMAGES) return null;
      const highest = await tx.portfolioImage.aggregate({
        where: { settingsId: SETTINGS_ID },
        _max: { sortOrder: true },
      });
      return tx.portfolioImage.create({
        data: {
          settingsId: SETTINGS_ID,
          storageKey: key,
          sortOrder: (highest._max.sortOrder ?? -1) + 1,
        },
      });
    });
    if (!image) {
      await cleanupNewObject(adapter, key);
      return portfolioLimit();
    }
    return {
      ok: true,
      image: {
        id: image.id,
        url: adapter.resolvePublicUrl(image.storageKey),
        sortOrder: image.sortOrder,
        focalX: image.focalX,
        focalY: image.focalY,
      },
    };
  } catch (error) {
    await cleanupNewObject(adapter, key);
    if (await portfolioIsFull()) return portfolioLimit();
    throw error;
  }
}

export async function removePortfolioImageAuthed(
  store: SessionCookieStore,
  id: string,
  storage?: MediaStorage,
): Promise<MediaWriteResult> {
  const gate = await requireAdmin(store);
  if (gate) return gate;
  const image = await prisma.portfolioImage.findFirst({
    where: { id: id.trim(), settingsId: SETTINGS_ID },
  });
  if (!image) return notFound("התמונה לא נמצאה.");

  await prisma.portfolioImage.delete({ where: { id: image.id } });
  const adapter = storage ?? (await getMediaStorage());
  const warning = await deleteStoredObject(adapter, image.storageKey);
  return { ok: true, ...(warning ? { warning } : {}) };
}

export async function savePortfolioFocalPositionAuthed(
  store: SessionCookieStore,
  id: string,
  focalX: number,
  focalY: number,
): Promise<MediaWriteResult> {
  const gate = await requireAdmin(store);
  if (gate) return gate;
  if (![focalX, focalY].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
    return invalid("מיקום התמונה אינו תקין.");
  }
  const updated = await prisma.portfolioImage.updateMany({
    where: { id: id.trim(), settingsId: SETTINGS_ID },
    data: { focalX, focalY },
  });
  if (updated.count !== 1) return notFound("התמונה לא נמצאה.");
  return { ok: true };
}

export async function saveLogoDisplaySizeAuthed(
  store: SessionCookieStore,
  size: unknown,
): Promise<MediaWriteResult> {
  const gate = await requireAdmin(store);
  if (gate) return gate;
  if (typeof size !== "string" || !LOGO_DISPLAY_SIZES.includes(size as LogoDisplaySize)) {
    return invalid("גודל הלוגו אינו תקין.");
  }
  const updated = await prisma.settings.updateMany({
    where: { id: SETTINGS_ID },
    data: { logoDisplaySize: size as LogoDisplaySize },
  });
  if (updated.count !== 1) return notFound();
  return { ok: true, logoDisplaySize: size as LogoDisplaySize };
}

async function requireAdmin(store: SessionCookieStore): Promise<MediaWriteResult | null> {
  if (!(await loadProtectedAdmin(store)).ok) {
    return { ok: false, code: "unauthenticated", error: "נדרשת התחברות למערכת הניהול." };
  }
  return null;
}

async function validateAndOptimize(
  file: unknown,
  kind: "logo" | "portfolio",
): Promise<{ ok: true; body: Uint8Array } | Extract<MediaWriteResult, { ok: false }>> {
  try {
    return { ok: true, body: await optimizeUploadedImage(file, kind) };
  } catch (error) {
    if (error instanceof ImageValidationError) return invalid(error.message);
    throw error;
  }
}

async function portfolioIsFull(): Promise<boolean> {
  return (await prisma.portfolioImage.count({ where: { settingsId: SETTINGS_ID } })) >= MAX_PORTFOLIO_IMAGES;
}

async function cleanupNewObject(storage: MediaStorage, key: string): Promise<void> {
  await storage.delete(key).catch((error) => console.error("Failed to clean up new media object", error));
}

async function deleteStoredObject(storage: MediaStorage, key: string): Promise<string | undefined> {
  try {
    await storage.delete(key);
    return undefined;
  } catch (error) {
    console.error("Failed to delete removed media object", error);
    return "הפריט הוסר מהתצוגה, אך ניקוי הקובץ לא הושלם.";
  }
}

function invalid(error: string): Extract<MediaWriteResult, { ok: false }> {
  return { ok: false, code: "invalid", error };
}

function demoUploadDisabled(): Extract<MediaWriteResult, { ok: false }> {
  return { ok: false, code: "demo_disabled", error: "העלאת תמונות ולוגו אינה זמינה בדמו הציבורי." };
}

function notFound(error = "הגדרות העסק לא נמצאו."): Extract<MediaWriteResult, { ok: false }> {
  return { ok: false, code: "not_found", error };
}

function portfolioLimit(): Extract<MediaWriteResult, { ok: false }> {
  return invalid("ניתן להציג עד 5 תמונות.");
}
