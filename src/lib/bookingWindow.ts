import { formatInTimeZone } from "date-fns-tz";

export function calendarDateInZone(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd");
}

export function thisMonthStart(now: Date, timeZone: string): string {
  return `${calendarDateInZone(now, timeZone).slice(0, 7)}-01`;
}

export function lastBookableDate(now: Date, timeZone: string): string {
  const today = calendarDateInZone(now, timeZone);
  const [year, month] = today.split("-").map(Number);
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.toISOString().slice(0, 10);
}

export function isAfterBookingWindow(startAt: Date, now: Date, timeZone: string): boolean {
  return calendarDateInZone(startAt, timeZone) > lastBookableDate(now, timeZone);
}
