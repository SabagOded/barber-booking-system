import { describe, expect, it, vi } from "vitest";
import { buildAppleCalendarConfig, preloadAppleCalendar } from "./appleCalendar";

vi.mock("add-to-calendar-button", () => ({ atcb_action: vi.fn() }));
vi.mock("add-to-calendar-button/i18n/he", () => ({}));

describe("buildAppleCalendarConfig", () => {
  it("reuses the cached package and Hebrew locale preload", async () => {
    const first = preloadAppleCalendar();
    const second = preloadAppleCalendar();

    expect(second).toBe(first);
    await first;
    expect(preloadAppleCalendar()).toBe(first);
  });

  it("maps the appointment to an Apple-only Jerusalem calendar action", () => {
    expect(
      buildAppleCalendarConfig({
        title: "תספורת — המספרה",
        description: "שם: דוד כהן\nנייד: 0500000000",
        startAtIso: "2026-09-14T14:00:00.000Z",
        endAtIso: "2026-09-14T14:30:00.000Z",
        uid: "appointment-1@appointment-booking",
        location: " רח׳ הרצל 12, רמלה ",
      }),
    ).toEqual({
      name: "תספורת — המספרה",
      description: "שם: דוד כהן\nנייד: 0500000000",
      startDate: "2026-09-14",
      startTime: "17:00",
      endDate: "2026-09-14",
      endTime: "17:30",
      timeZone: "Asia/Jerusalem",
      location: "רח׳ הרצל 12, רמלה",
      uid: "appointment-1@appointment-booking",
      options: ["apple"],
      iCalFileName: "appointment",
      listStyle: "modal",
      language: "he",
    });
  });

  it("omits an empty location without changing the event times", () => {
    const config = buildAppleCalendarConfig({
      title: "תספורת",
      description: "פרטי התור",
      startAtIso: "2026-09-14T21:30:00.000Z",
      endAtIso: "2026-09-14T22:00:00.000Z",
      uid: "appointment-2@appointment-booking",
      location: "   ",
    });

    expect(config.location).toBeUndefined();
    expect(config.startDate).toBe("2026-09-15");
    expect(config.startTime).toBe("00:30");
    expect(config.endDate).toBe("2026-09-15");
    expect(config.endTime).toBe("01:00");
  });
});
