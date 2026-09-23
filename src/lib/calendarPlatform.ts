export type CalendarTarget = "apple" | "google" | "ics";

export type CalendarPlatformInfo = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
};

/** Keeps user-agent handling in one place and leaves unfamiliar mobile clients on ICS. */
export function selectCalendarTarget({
  userAgent,
  platform = "",
  maxTouchPoints = 0,
}: CalendarPlatformInfo): CalendarTarget {
  const isClassicIos = /iPhone|iPad|iPod/i.test(userAgent);
  const isModernIpad = /^MacIntel$/i.test(platform) && maxTouchPoints > 1;

  if (isClassicIos || isModernIpad) {
    return "apple";
  }

  if (/Android/i.test(userAgent)) {
    return "google";
  }

  const isDesktop =
    /Windows NT|Macintosh|X11|CrOS|Linux x86_64/i.test(userAgent) ||
    /^(Win32|Win64|MacIntel|Linux x86_64)$/i.test(platform);

  return isDesktop ? "google" : "ics";
}
