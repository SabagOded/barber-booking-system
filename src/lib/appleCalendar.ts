import { formatInTimeZone } from "date-fns-tz";
import type { ATCBActionEventConfig } from "add-to-calendar-button";

const APPLE_CALENDAR_TIME_ZONE = "Asia/Jerusalem";

type AppleCalendarModule = typeof import("add-to-calendar-button");

let appleCalendarModulePromise: Promise<AppleCalendarModule> | null = null;

export type AppleCalendarEvent = {
  title: string;
  description: string;
  startAtIso: string;
  endAtIso: string;
  uid: string;
  location?: string;
};

export function buildAppleCalendarConfig(
  event: AppleCalendarEvent,
): ATCBActionEventConfig {
  return {
    name: event.title,
    description: event.description,
    startDate: formatInTimeZone(event.startAtIso, APPLE_CALENDAR_TIME_ZONE, "yyyy-MM-dd"),
    startTime: formatInTimeZone(event.startAtIso, APPLE_CALENDAR_TIME_ZONE, "HH:mm"),
    endDate: formatInTimeZone(event.endAtIso, APPLE_CALENDAR_TIME_ZONE, "yyyy-MM-dd"),
    endTime: formatInTimeZone(event.endAtIso, APPLE_CALENDAR_TIME_ZONE, "HH:mm"),
    timeZone: APPLE_CALENDAR_TIME_ZONE,
    location: event.location?.trim() || undefined,
    uid: event.uid,
    options: ["apple"],
    iCalFileName: "appointment",
    listStyle: "modal",
    language: "he",
  };
}

export function preloadAppleCalendar(): Promise<AppleCalendarModule> {
  if (!appleCalendarModulePromise) {
    appleCalendarModulePromise = Promise.all([
      import("add-to-calendar-button"),
      import("add-to-calendar-button/i18n/he"),
    ])
      .then(([calendarModule]) => calendarModule)
      .catch((error) => {
        appleCalendarModulePromise = null;
        throw error;
      });
  }

  return appleCalendarModulePromise;
}

export async function openAppleCalendar(
  event: AppleCalendarEvent,
  triggerElement: HTMLElement,
): Promise<void> {
  const { atcb_action } = await preloadAppleCalendar();

  await atcb_action(buildAppleCalendarConfig(event), triggerElement);
}
