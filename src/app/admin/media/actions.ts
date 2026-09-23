"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { LogoDisplaySize } from "@/lib/media/logoDisplay";
import {
  removeLogoAuthed,
  removePortfolioImageAuthed,
  saveLogoDisplaySizeAuthed,
  savePortfolioFocalPositionAuthed,
  uploadLogoAuthed,
  uploadPortfolioImageAuthed,
  type MediaWriteResult,
} from "@/lib/media/shopMedia";

function refreshMedia() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/media");
}

async function runMediaWrite(action: () => Promise<MediaWriteResult>): Promise<MediaWriteResult> {
  try {
    const result = await action();
    if (result.ok) refreshMedia();
    return result;
  } catch (error) {
    console.error("Media write failed", error);
    return {
      ok: false,
      code: "failed",
      error: "לא הצלחנו לשמור את השינוי. נסו שוב.",
    };
  }
}

export async function uploadShopLogo(formData: FormData) {
  return runMediaWrite(async () => uploadLogoAuthed(await cookies(), formData.get("image")));
}

export async function removeShopLogo() {
  return runMediaWrite(async () => removeLogoAuthed(await cookies()));
}

export async function saveShopLogoDisplaySize(size: LogoDisplaySize) {
  return runMediaWrite(async () => saveLogoDisplaySizeAuthed(await cookies(), size));
}

export async function uploadShopPortfolioImage(formData: FormData) {
  return runMediaWrite(async () =>
    uploadPortfolioImageAuthed(await cookies(), formData.get("image")),
  );
}

export async function removeShopPortfolioImage(id: string) {
  return runMediaWrite(async () => removePortfolioImageAuthed(await cookies(), id));
}

export async function saveShopPortfolioFocalPosition(
  id: string,
  focalX: number,
  focalY: number,
) {
  return runMediaWrite(async () =>
    savePortfolioFocalPositionAuthed(await cookies(), id, focalX, focalY),
  );
}
