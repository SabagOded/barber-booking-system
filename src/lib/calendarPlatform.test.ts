import { describe, expect, it } from "vitest";
import { selectCalendarTarget } from "./calendarPlatform";

describe("selectCalendarTarget", () => {
  it("uses Apple Calendar for iPhone and iPadOS desktop-style user agents", () => {
    expect(
      selectCalendarTarget({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toBe("apple");

    expect(
      selectCalendarTarget({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe("apple");
  });

  it("uses Google Calendar on Android", () => {
    expect(
      selectCalendarTarget({
        userAgent:
          "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
      }),
    ).toBe("google");
  });

  it("uses Google Calendar on desktop browsers", () => {
    expect(
      selectCalendarTarget({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
        platform: "Win32",
      }),
    ).toBe("google");
  });

  it("falls back to ICS for unknown mobile clients", () => {
    expect(
      selectCalendarTarget({
        userAgent: "ExampleMobileBrowser/1.0 Mobile",
        platform: "Unknown",
        maxTouchPoints: 2,
      }),
    ).toBe("ics");
  });
});
