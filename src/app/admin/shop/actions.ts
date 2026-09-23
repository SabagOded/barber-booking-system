"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  clearDoorNoticeAuthed,
  saveCalendarNoteAuthed,
  saveDoorNoticeAuthed,
  saveShopTextAuthed,
  type SettingsWrite,
} from "@/lib/shopSettings";

type ShopActionResult =
  | SettingsWrite
  | { ok: false; code: "failed"; error: string };

function refreshShop() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/day");
  revalidatePath("/admin/hours");
  revalidatePath("/admin/shop");
  revalidatePath("/admin/settings");
}

async function runShopWrite(action: () => Promise<SettingsWrite>): Promise<ShopActionResult> {
  try {
    const result = await action();
    if (result.ok) {
      refreshShop();
    }
    return result;
  } catch {
    return { ok: false, code: "failed", error: "לא הצלחנו לשמור את השינוי. נסו שוב." };
  }
}

export async function saveShopDetails(input: {
  businessName: string;
  providerName: string;
  tagline: string;
  address: string;
  phone: string;
  whatsappPhone: string;
}) {
  return runShopWrite(async () => saveShopTextAuthed(await cookies(), input));
}

export async function saveCalendarNote(calendarNote: string) {
  return runShopWrite(async () => saveCalendarNoteAuthed(await cookies(), calendarNote));
}

export async function saveHomeNotice(input: { text: string; until: string }) {
  return runShopWrite(async () => saveDoorNoticeAuthed(await cookies(), input));
}

export async function clearHomeNotice() {
  return runShopWrite(async () => clearDoorNoticeAuthed(await cookies()));
}
