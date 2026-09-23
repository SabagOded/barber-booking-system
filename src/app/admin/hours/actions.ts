"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  closeExceptionDayAuthed,
  closeExceptionRangeAuthed,
  removeExceptionAuthed,
  saveWeeklyHoursAuthed,
  setExceptionHoursAuthed,
  type SettingsWrite,
} from "@/lib/shopSettings";

type HoursActionResult =
  | SettingsWrite
  | { ok: false; code: "failed"; error: string };

function refreshHours() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/day");
  revalidatePath("/admin/hours");
}

async function runHoursWrite(action: () => Promise<SettingsWrite>): Promise<HoursActionResult> {
  try {
    const result = await action();
    if (result.ok) {
      refreshHours();
    }
    return result;
  } catch {
    return { ok: false, code: "failed", error: "לא הצלחנו לשמור את השינוי. נסו שוב." };
  }
}

export async function saveWeeklyHours(
  rows: { weekday: number; isOpen: boolean; openTime: string; closeTime: string }[],
) {
  return runHoursWrite(async () => saveWeeklyHoursAuthed(await cookies(), rows));
}

export async function closeExceptionDay(date: string) {
  return runHoursWrite(async () => closeExceptionDayAuthed(await cookies(), date));
}

export async function closeExceptionRange(input: { startDate: string; endDate?: string }) {
  return runHoursWrite(async () => closeExceptionRangeAuthed(await cookies(), input));
}

export async function setExceptionHours(input: {
  date: string;
  openTime: string;
  closeTime: string;
}) {
  return runHoursWrite(async () => setExceptionHoursAuthed(await cookies(), input));
}

export async function removeException(date: string) {
  return runHoursWrite(async () => removeExceptionAuthed(await cookies(), date));
}
