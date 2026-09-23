import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  buildIcs,
  googleCalendarTemplateUrl,
  googleEventDetails,
  toUtcStamp,
} from "./calendar";

describe("calendar instants", () => {
  it("writes 17:00 Asia/Jerusalem as the matching UTC instant, not 17:00Z", () => {
    const start = fromZonedTime("2026-09-14T17:00:00", "Asia/Jerusalem");
    const end = fromZonedTime("2026-09-14T17:30:00", "Asia/Jerusalem");

    expect(toUtcStamp(start.toISOString())).toBe("20260914T140000Z");
    expect(toUtcStamp(end.toISOString())).toBe("20260914T143000Z");

    const ics = buildIcs({
      title: "שירות — שם העסק",
      description: "שם: דוד כהן",
      startAtIso: start.toISOString(),
      endAtIso: end.toISOString(),
      uid: "test-1",
      location: "רח׳ הרצל 12, רמלה",
    });

    expect(ics).toContain("DTSTART:20260914T140000Z");
    expect(ics).toContain("DTEND:20260914T143000Z");
    expect(ics).not.toContain("DTSTART:20260914T170000Z");
    expect(ics).toContain("METHOD:PUBLISH\r\nBEGIN:VEVENT");
    expect(ics).toContain("UID:test-1");
    expect(ics).toContain("SUMMARY:שירות — שם העסק");
    expect(ics).toContain("DESCRIPTION:שם: דוד כהן");
    expect(ics).toContain("LOCATION:רח׳ הרצל 12\\, רמלה");

    const google = googleCalendarTemplateUrl({
      title: "שירות — שם העסק",
      description: "נתראה בקרוב. אם צריך לבטל, שלחו הודעה בוואטסאפ.",
      startAtIso: start.toISOString(),
      endAtIso: end.toISOString(),
      location: "רח׳ הרצל 12, רמלה",
    });

    expect(google).toContain("https://calendar.google.com/calendar/render?");
    expect(google).toContain("action=TEMPLATE");
    expect(google).toContain("20260914T140000Z%2F20260914T143000Z");
    expect(google).toContain("text=");
    expect(google).toContain("details=");
    expect(google).toContain("location=");
    expect(google).not.toContain("20260914T170000Z");
    expect(google).not.toContain("ctz=");
  });

  it("omits location from the Google template when address is empty", () => {
    const start = fromZonedTime("2026-09-14T17:00:00", "Asia/Jerusalem");
    const end = fromZonedTime("2026-09-14T17:30:00", "Asia/Jerusalem");
    const google = googleCalendarTemplateUrl({
      title: "שירות — שם העסק",
      description: "נתראה בקרוב.",
      startAtIso: start.toISOString(),
      endAtIso: end.toISOString(),
      location: "  ",
    });
    expect(google).not.toContain("location=");
  });

  it("uses calendarNote for Google details when present, else shop + address + phone", () => {
    expect(
      googleEventDetails({
        calendarNote: "נתראה בקרוב. אם צריך לבטל, שלחו הודעה בוואטסאפ.",
        shopName: "שם העסק",
        address: "רח׳ הרצל 12, רמלה",
        phone: "0500000000",
      }),
    ).toBe("נתראה בקרוב. אם צריך לבטל, שלחו הודעה בוואטסאפ.");

    expect(
      googleEventDetails({
        calendarNote: "   ",
        shopName: "שם העסק",
        address: "רח׳ הרצל 12, רמלה",
        phone: "0500000000",
      }),
    ).toBe("שם העסק\nרח׳ הרצל 12, רמלה\n0500000000");

    expect(
      googleEventDetails({
        calendarNote: undefined,
        shopName: "שם העסק",
        address: undefined,
        phone: "0500000000",
      }),
    ).toBe("שם העסק\n0500000000");
  });

  it("does not throw when address is null or undefined", () => {
    expect(() =>
      googleCalendarTemplateUrl({
        title: "שירות — שם העסק",
        description: googleEventDetails({
          calendarNote: null,
          shopName: "שם העסק",
          address: null,
        }),
        startAtIso: "2026-09-14T14:00:00.000Z",
        endAtIso: "2026-09-14T14:30:00.000Z",
        location: undefined,
      }),
    ).not.toThrow();
  });
});
