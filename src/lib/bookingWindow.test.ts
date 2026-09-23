import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { isAfterBookingWindow, lastBookableDate, thisMonthStart } from "./bookingWindow";

const TZ = "Asia/Jerusalem";

function jerusalem(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, TZ);
}

describe("booking window", () => {
  it("from 31 Aug reaches the last day of next month (30 Sep), not 30 days later", () => {
    const now = jerusalem("2026-08-31", "10:00");
    expect(thisMonthStart(now, TZ)).toBe("2026-08-01");
    expect(lastBookableDate(now, TZ)).toBe("2026-09-30");
    expect(isAfterBookingWindow(jerusalem("2026-09-30", "10:00"), now, TZ)).toBe(false);
    expect(isAfterBookingWindow(jerusalem("2026-10-01", "10:00"), now, TZ)).toBe(true);
  });

  it("from 1 Sep reaches 31 Oct", () => {
    const now = jerusalem("2026-09-01", "08:00");
    expect(thisMonthStart(now, TZ)).toBe("2026-09-01");
    expect(lastBookableDate(now, TZ)).toBe("2026-10-31");
    expect(isAfterBookingWindow(jerusalem("2026-10-31", "09:00"), now, TZ)).toBe(false);
    expect(isAfterBookingWindow(jerusalem("2026-11-01", "09:00"), now, TZ)).toBe(true);
  });
});
