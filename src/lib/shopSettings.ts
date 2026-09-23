import type { Prisma } from "@prisma/client";
import { loadProtectedAdmin, type SessionCookieStore } from "./adminSession";
import { prisma } from "./prisma";
import { isCalendarDate, isClockTime, clockToMinutes } from "./shopHours";
import { retryOnBusy } from "./booking";
import { DEMO_MAX_EXCEPTION_DATES, isDemoMode } from "./demoMode";
import { isSlotIntervalOption } from "./slotIntervals";

export type SettingsWrite =
  | { ok: true }
  | {
      ok: false;
      code: "unauthenticated" | "invalid" | "demo_limit";
      error?: string;
      field?: "businessName" | "doorNoticeUntil";
    };

const CLOSE_AFTER_OPEN = "שעת הסגירה חייבת להיות אחרי שעת הפתיחה";
const OPEN_ON_INTERVAL = "שעת הפתיחה חייבת להתאים למרווח התורים";
const WEEKDAYS_REQUIRED = "יש להזין פעם אחת כל יום בשבוע";
const NAME_REQUIRED = "נא להזין שם חנות";
const EXCEPTION_LIMIT_ERROR = "הדמו הגיע למגבלה של 10 תאריכים חריגים. אפשר לאפס את הדמו ולהמשיך.";
const END_BEFORE_START = "תאריך הסיום לא יכול להיות מוקדם מתאריך ההתחלה";

async function exceptionLimitReached(tx: Prisma.TransactionClient, date: string): Promise<boolean> {
  if (!isDemoMode()) return false;
  await tx.$executeRaw`UPDATE "Settings" SET "businessName" = "businessName" WHERE "id" = 1`;
  const [closed, overridden] = await Promise.all([
    tx.closedDate.findMany({ select: { date: true } }),
    tx.hoursOverride.findMany({ select: { date: true } }),
  ]);
  const dates = new Set([...closed, ...overridden].map((row) => row.date));
  return !dates.has(date) && dates.size >= DEMO_MAX_EXCEPTION_DATES;
}

function isAlignedOpen(openTime: string, intervalMinutes: number): boolean {
  return clockToMinutes(openTime) % intervalMinutes === 0;
}

function requireHours(openTime: string, closeTime: string): string | null {
  if (!isClockTime(openTime) || !isClockTime(closeTime)) {
    return CLOSE_AFTER_OPEN;
  }
  if (clockToMinutes(closeTime) <= clockToMinutes(openTime)) {
    return CLOSE_AFTER_OPEN;
  }
  return null;
}

async function gated(
  store: SessionCookieStore,
  run: () => Promise<SettingsWrite>,
): Promise<SettingsWrite> {
  const gate = await loadProtectedAdmin(store);
  if (!gate.ok) {
    return { ok: false, code: "unauthenticated" };
  }
  return run();
}

export async function saveWeeklyHoursAuthed(
  store: SessionCookieStore,
  rows: { weekday: number; isOpen: boolean; openTime: string; closeTime: string }[],
): Promise<SettingsWrite> {
  return gated(store, async () => {
    if (
      rows.length !== 7 ||
      new Set(rows.map((row) => row.weekday)).size !== 7 ||
      rows.some((row) => !Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6)
    ) {
      return { ok: false, code: "invalid", error: WEEKDAYS_REQUIRED };
    }
    for (const row of rows) {
      if (!row.isOpen) {
        continue;
      }
      const error = requireHours(row.openTime, row.closeTime);
      if (error) {
        return { ok: false, code: "invalid", error };
      }
    }
    return prisma.$transaction(async (tx) => {
      const settings = await tx.settings.findUniqueOrThrow({ where: { id: 1 } });
      if (rows.some((row) => row.isOpen && !isAlignedOpen(row.openTime, settings.slotIntervalMinutes))) {
        return { ok: false, code: "invalid", error: OPEN_ON_INTERVAL };
      }
      for (const row of rows) {
        await tx.workingHours.upsert({
          where: { weekday: row.weekday },
          update: {
            isOpen: row.isOpen,
            openTime: row.isOpen ? row.openTime : "00:00",
            closeTime: row.isOpen ? row.closeTime : "00:00",
          },
          create: {
            weekday: row.weekday,
            isOpen: row.isOpen,
            openTime: row.isOpen ? row.openTime : "00:00",
            closeTime: row.isOpen ? row.closeTime : "00:00",
          },
        });
      }
      return { ok: true };
    });
  });
}

export async function saveSlotIntervalAuthed(
  store: SessionCookieStore,
  minutes: number,
): Promise<SettingsWrite> {
  return gated(store, async () => {
    if (!isSlotIntervalOption(minutes)) {
      return { ok: false, code: "invalid", error: "מרווח לא תקין" };
    }
    return prisma.$transaction(async (tx) => {
      const [weekly, overrides] = await Promise.all([
        tx.workingHours.findMany({ where: { isOpen: true }, select: { openTime: true } }),
        tx.hoursOverride.findMany({ select: { openTime: true } }),
      ]);
      if ([...weekly, ...overrides].some((row) => !isAlignedOpen(row.openTime, minutes))) {
        return { ok: false, code: "invalid", error: OPEN_ON_INTERVAL };
      }
      await tx.settings.update({
        where: { id: 1 },
        data: { slotIntervalMinutes: minutes },
      });
      return { ok: true };
    });
  });
}

export async function saveShopTextAuthed(
  store: SessionCookieStore,
  input: {
    businessName: string;
    providerName: string;
    tagline: string;
    address: string;
    phone: string;
    whatsappPhone: string;
  },
): Promise<SettingsWrite> {
  return gated(store, async () => {
    const businessName = input.businessName.trim();
    if (!businessName) {
      return { ok: false, code: "invalid", error: NAME_REQUIRED, field: "businessName" };
    }
    const providerName = input.providerName.trim();
    const whatsappPhone = input.whatsappPhone.replace(/\D/g, "");
    await prisma.settings.update({
      where: { id: 1 },
      data: {
        businessName,
        providerName,
        tagline: input.tagline.trim(),
        address: input.address.trim(),
        phone: input.phone.trim(),
        whatsappPhone,
      },
    });
    return { ok: true };
  });
}

export async function saveCalendarNoteAuthed(
  store: SessionCookieStore,
  calendarNote: string,
): Promise<SettingsWrite> {
  return gated(store, async () => {
    await prisma.settings.update({
      where: { id: 1 },
      data: { calendarNote: calendarNote.trim() },
    });
    return { ok: true };
  });
}

export async function saveDoorNoticeAuthed(
  store: SessionCookieStore,
  input: { text: string; until: string },
): Promise<SettingsWrite> {
  return gated(store, async () => {
    const until = input.until.trim();
    if (until && !isCalendarDate(until)) {
      return {
        ok: false,
        code: "invalid",
        error: "תאריך לא תקין",
        field: "doorNoticeUntil",
      };
    }
    await prisma.settings.update({
      where: { id: 1 },
      data: {
        doorNotice: input.text.trim(),
        doorNoticeUntil: until,
      },
    });
    return { ok: true };
  });
}

export async function clearDoorNoticeAuthed(store: SessionCookieStore): Promise<SettingsWrite> {
  return gated(store, async () => {
    await prisma.settings.update({
      where: { id: 1 },
      data: { doorNotice: "", doorNoticeUntil: "" },
    });
    return { ok: true };
  });
}

export async function closeExceptionDayAuthed(
  store: SessionCookieStore,
  date: string,
): Promise<SettingsWrite> {
  return closeExceptionRangeAuthed(store, { startDate: date, endDate: date });
}

export async function closeExceptionRangeAuthed(
  store: SessionCookieStore,
  input: { startDate: string; endDate?: string },
): Promise<SettingsWrite> {
  return gated(store, async () => {
    const endDate = input.endDate || input.startDate;
    const dates = inclusiveCalendarDates(input.startDate, endDate);
    if (!dates) {
      return { ok: false, code: "invalid", error: "תאריך לא תקין" };
    }
    if (endDate < input.startDate) {
      return { ok: false, code: "invalid", error: END_BEFORE_START };
    }
    return retryOnBusy(() => prisma.$transaction(async (tx): Promise<SettingsWrite> => {
      if (isDemoMode()) {
        await tx.$executeRaw`UPDATE "Settings" SET "businessName" = "businessName" WHERE "id" = 1`;
        const [closed, overridden] = await Promise.all([
          tx.closedDate.findMany({ select: { date: true } }),
          tx.hoursOverride.findMany({ select: { date: true } }),
        ]);
        const resultingDates = new Set([
          ...closed.map((row) => row.date),
          ...overridden.map((row) => row.date),
          ...dates,
        ]);
        if (resultingDates.size > DEMO_MAX_EXCEPTION_DATES) {
          return { ok: false, code: "demo_limit", error: EXCEPTION_LIMIT_ERROR };
        }
      }
      await tx.hoursOverride.deleteMany({ where: { date: { in: dates } } });
      for (const date of dates) {
        await tx.closedDate.upsert({
          where: { date },
          update: {},
          create: { date },
        });
      }
      return { ok: true };
    }));
  });
}

function inclusiveCalendarDates(startDate: string, endDate: string): string[] | null {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (!start || !end) return null;
  if (end.getTime() < start.getTime()) return [];

  const dates: string[] = [];
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = new Date(cursor.getTime() + 86_400_000)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function parseCalendarDate(value: string): Date | null {
  if (!isCalendarDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

export async function setExceptionHoursAuthed(
  store: SessionCookieStore,
  input: { date: string; openTime: string; closeTime: string },
): Promise<SettingsWrite> {
  return gated(store, async () => {
    if (!isCalendarDate(input.date)) {
      return { ok: false, code: "invalid", error: "תאריך לא תקין" };
    }
    const error = requireHours(input.openTime, input.closeTime);
    if (error) {
      return { ok: false, code: "invalid", error };
    }
    return retryOnBusy(() => prisma.$transaction(async (tx): Promise<SettingsWrite> => {
      if (await exceptionLimitReached(tx, input.date)) {
        return { ok: false, code: "demo_limit", error: EXCEPTION_LIMIT_ERROR };
      }
      const settings = await tx.settings.findUniqueOrThrow({ where: { id: 1 } });
      if (!isAlignedOpen(input.openTime, settings.slotIntervalMinutes)) {
        return { ok: false, code: "invalid", error: OPEN_ON_INTERVAL };
      }
      await tx.closedDate.deleteMany({ where: { date: input.date } });
      await tx.hoursOverride.upsert({
        where: { date: input.date },
        update: { openTime: input.openTime, closeTime: input.closeTime },
        create: { date: input.date, openTime: input.openTime, closeTime: input.closeTime },
      });
      return { ok: true };
    }));
  });
}

export async function removeExceptionAuthed(
  store: SessionCookieStore,
  date: string,
): Promise<SettingsWrite> {
  return gated(store, async () => {
    if (!isCalendarDate(date)) {
      return { ok: false, code: "invalid", error: "תאריך לא תקין" };
    }
    await prisma.$transaction([
      prisma.closedDate.deleteMany({ where: { date } }),
      prisma.hoursOverride.deleteMany({ where: { date } }),
    ]);
    return { ok: true };
  });
}
