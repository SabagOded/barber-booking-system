import { describe, expect, it } from "vitest";
import { formatHebrewCalendarDate } from "./dateDisplay";

describe("formatHebrewCalendarDate", () => {
  it("formats a calendar date in controlled, human-readable Hebrew", () => {
    expect(formatHebrewCalendarDate("2026-09-23")).toBe("23 בספטמבר 2026");
  });

  it("does not shift the day across host timezones", () => {
    expect(formatHebrewCalendarDate("2026-01-01")).toBe("1 בינואר 2026");
  });

  it("leaves malformed or impossible values unchanged", () => {
    expect(formatHebrewCalendarDate("2026-02-30")).toBe("2026-02-30");
    expect(formatHebrewCalendarDate("not-a-date")).toBe("not-a-date");
  });
});
