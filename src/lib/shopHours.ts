import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { Prisma, PrismaClient } from "@prisma/client";
import { calendarDateInZone, lastBookableDate } from "./bookingWindow";
import { prisma } from "./prisma";

export type HoursClient = PrismaClient | Prisma.TransactionClient;

export type EffectiveHours =
  | { isOpen: false }
  | { isOpen: true; openTime: string; closeTime: string };

export type UpcomingException = {
  date: string;
  dateLabel: string;
  rule: string;
};

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{2}:\d{2}$/;
const DAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export function isCalendarDate(value: string): boolean {
  return CALENDAR_DATE.test(value);
}

export function isClockTime(value: string): boolean {
  if (!CLOCK.test(value)) {
    return false;
  }
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function clockToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function weekdayInTimeZone(date: string, timeZone: string): number {
  const noon = fromZonedTime(`${date}T12:00:00`, timeZone);
  return Number(formatInTimeZone(noon, timeZone, "i")) % 7;
}

export function resolveEffectiveHours(input: {
  override: { openTime: string; closeTime: string } | null;
  closed: boolean;
  template: { isOpen: boolean; openTime: string; closeTime: string } | null;
}): EffectiveHours {
  if (input.override) {
    if (clockToMinutes(input.override.openTime) >= clockToMinutes(input.override.closeTime)) {
      return { isOpen: false };
    }
    return { isOpen: true, openTime: input.override.openTime, closeTime: input.override.closeTime };
  }
  if (input.closed) {
    return { isOpen: false };
  }
  const template = input.template;
  if (!template?.isOpen) {
    return { isOpen: false };
  }
  if (clockToMinutes(template.openTime) >= clockToMinutes(template.closeTime)) {
    return { isOpen: false };
  }
  return { isOpen: true, openTime: template.openTime, closeTime: template.closeTime };
}

export async function getEffectiveHours(
  date: string,
  db: HoursClient = prisma,
): Promise<EffectiveHours> {
  const settings = await db.settings.findUnique({ where: { id: 1 }, select: { timezone: true } });
  const timeZone = settings?.timezone ?? "Asia/Jerusalem";
  const weekday = weekdayInTimeZone(date, timeZone);
  const [override, closed, template] = await Promise.all([
    db.hoursOverride.findUnique({ where: { date } }),
    db.closedDate.findUnique({ where: { date } }),
    db.workingHours.findUnique({ where: { weekday } }),
  ]);
  return resolveEffectiveHours({
    override: override ? { openTime: override.openTime, closeTime: override.closeTime } : null,
    closed: Boolean(closed),
    template,
  });
}

export function formatTemplateHoursParts(
  hours: { weekday: number; isOpen: boolean; openTime: string; closeTime: string }[],
): string[] {
  const openDays = hours.filter((row) => row.isOpen).sort((a, b) => a.weekday - b.weekday);
  const groups: { start: number; end: number; openTime: string; closeTime: string }[] = [];

  for (const day of openDays) {
    const last = groups.at(-1);
    if (
      last &&
      last.end + 1 === day.weekday &&
      last.openTime === day.openTime &&
      last.closeTime === day.closeTime
    ) {
      last.end = day.weekday;
    } else {
      groups.push({
        start: day.weekday,
        end: day.weekday,
        openTime: day.openTime,
        closeTime: day.closeTime,
      });
    }
  }

  return groups.map((group) => {
    const days =
      group.start === group.end
        ? DAY_LETTERS[group.start]
        : `${DAY_LETTERS[group.start]}–${DAY_LETTERS[group.end]}`;
    return `${days} \u2066${group.openTime}–${group.closeTime}\u2069`;
  });
}

export function isDoorNoticeActive(text: string, until: string, today: string): boolean {
  if (!text.trim()) {
    return false;
  }
  if (!until.trim()) {
    return true;
  }
  return until >= today;
}

export async function listUpcomingExceptions(
  now: Date,
  db: HoursClient = prisma,
): Promise<UpcomingException[]> {
  const settings = await db.settings.findUnique({ where: { id: 1 }, select: { timezone: true } });
  const timeZone = settings?.timezone ?? "Asia/Jerusalem";
  const today = calendarDateInZone(now, timeZone);
  const end = lastBookableDate(now, timeZone);
  const [overrides, closed] = await Promise.all([
    db.hoursOverride.findMany({
      where: { date: { gte: today, lte: end } },
      orderBy: { date: "asc" },
    }),
    db.closedDate.findMany({
      where: { date: { gte: today, lte: end } },
      orderBy: { date: "asc" },
    }),
  ]);
  const byDate = new Map<string, UpcomingException>();
  for (const row of closed) {
    byDate.set(row.date, {
      date: row.date,
      dateLabel: formatExceptionDate(row.date, timeZone),
      rule: "סגור",
    });
  }
  for (const row of overrides) {
    byDate.set(row.date, {
      date: row.date,
      dateLabel: formatExceptionDate(row.date, timeZone),
      rule: `${row.openTime}–${row.closeTime}`,
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function formatExceptionDate(date: string, timeZone: string): string {
  const noon = fromZonedTime(`${date}T12:00:00`, timeZone);
  return formatInTimeZone(noon, timeZone, "d.M");
}
