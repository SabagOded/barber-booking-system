"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  saveSlotIntervalAuthed,
  type SettingsWrite,
} from "@/lib/shopSettings";

function refreshShop() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/day");
  revalidatePath("/admin/settings");
}

async function withRefresh(result: SettingsWrite): Promise<SettingsWrite> {
  if (result.ok) {
    refreshShop();
  }
  return result;
}

export async function saveSlotInterval(minutes: number) {
  return withRefresh(await saveSlotIntervalAuthed(await cookies(), minutes));
}
