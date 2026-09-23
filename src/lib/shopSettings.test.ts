import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { createSession, type SessionCookieStore } from "./adminSession";
import { prisma } from "./prisma";
import { prepareTestDb, resetTestDb } from "@/test/resetTestDb";
import { DEMO_MAX_EXCEPTION_DATES } from "./demoMode";
import {
  clearDoorNoticeAuthed,
  closeExceptionDayAuthed,
  closeExceptionRangeAuthed,
  removeExceptionAuthed,
  saveCalendarNoteAuthed,
  saveDoorNoticeAuthed,
  saveShopTextAuthed,
  saveSlotIntervalAuthed,
  saveWeeklyHoursAuthed,
  setExceptionHoursAuthed,
} from "./shopSettings";

const TZ = "Asia/Jerusalem";
const TUESDAY = "2026-09-15";

function memoryCookies(): SessionCookieStore {
  const values = new Map<string, string>();
  return {
    get(name) {
      const value = values.get(name);
      return value === undefined ? undefined : { value };
    },
    set(name, value) {
      values.set(name, value);
    },
    delete(name) {
      values.delete(name);
    },
  };
}

function weekRows(closeTime = "19:00") {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    isOpen: weekday !== 6,
    openTime: weekday === 6 ? "00:00" : "09:00",
    closeTime: weekday === 6 ? "00:00" : weekday === 5 ? "14:00" : closeTime,
  }));
}

async function seedBase() {
  await prisma.settings.create({
    data: {
      id: 1,
      businessName: "שם העסק",
      providerName: "נותן השירות",
      phone: "0500000000",
      whatsappPhone: "972500000000",
      timezone: TZ,
      slotIntervalMinutes: 30,
    },
  });
  await prisma.workingHours.createMany({ data: weekRows() });
}

async function authedCookies() {
  const store = memoryCookies();
  await createSession(store);
  return store;
}

describe("authenticated shop hours settings", () => {
  beforeAll(prepareTestDb);

  beforeEach(async () => {
    await resetTestDb();
    await seedBase();
  });

  it("limits new demo exception dates across both tables and allows switching existing dates", async () => {
    const previous = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "true";
    try {
      const store = await authedCookies();
      const dates = Array.from({ length: DEMO_MAX_EXCEPTION_DATES }, (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`);
      await prisma.closedDate.createMany({ data: dates.slice(0, 5).map((date) => ({ date })) });
      await prisma.hoursOverride.createMany({ data: dates.slice(5).map((date) => ({ date, openTime: "10:00", closeTime: "16:00" })) });
      expect(await closeExceptionDayAuthed(store, "2026-10-11")).toMatchObject({ ok: false, code: "demo_limit" });
      expect(await setExceptionHoursAuthed(store, { date: "2026-10-11", openTime: "10:00", closeTime: "16:00" })).toMatchObject({ ok: false, code: "demo_limit" });
      expect(await setExceptionHoursAuthed(store, { date: dates[0], openTime: "10:00", closeTime: "16:00" })).toEqual({ ok: true });
      expect(await closeExceptionDayAuthed(store, dates[5])).toEqual({ ok: true });
      expect(await prisma.closedDate.count() + await prisma.hoursOverride.count()).toBe(DEMO_MAX_EXCEPTION_DATES);
      expect(await removeExceptionAuthed(store, dates[0])).toEqual({ ok: true });
      expect(await closeExceptionDayAuthed(store, "2026-10-11")).toEqual({ ok: true });
    } finally {
      if (previous === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = previous;
    }
  });

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("saves all weekly rows including a closed day", async () => {
    const store = await authedCookies();
    const rows = weekRows("18:00");
    rows[1] = { weekday: 1, isOpen: false, openTime: "10:00", closeTime: "17:00" };

    expect(await saveWeeklyHoursAuthed(store, rows)).toEqual({ ok: true });

    const monday = await prisma.workingHours.findUnique({ where: { weekday: 1 } });
    const tuesday = await prisma.workingHours.findUnique({ where: { weekday: 2 } });
    expect(monday).toMatchObject({ isOpen: false, openTime: "00:00", closeTime: "00:00" });
    expect(tuesday).toMatchObject({ isOpen: true, openTime: "09:00", closeTime: "18:00" });
  });

  it("rejects an invalid weekly range without changing stored hours", async () => {
    const store = await authedCookies();
    const rows = weekRows();
    rows[2] = { weekday: 2, isOpen: true, openTime: "18:00", closeTime: "09:00" };

    const result = await saveWeeklyHoursAuthed(store, rows);
    const tuesday = await prisma.workingHours.findUnique({ where: { weekday: 2 } });

    expect(result).toEqual({
      ok: false,
      code: "invalid",
      error: "שעת הסגירה חייבת להיות אחרי שעת הפתיחה",
    });
    expect(tuesday).toMatchObject({ openTime: "09:00", closeTime: "19:00" });
  });

  it("rejects duplicate or missing weekdays without updating any weekly row", async () => {
    const store = await authedCookies();
    const rows = weekRows("18:00");
    rows[6] = { ...rows[6], weekday: 5 };

    expect(await saveWeeklyHoursAuthed(store, rows)).toEqual({
      ok: false, code: "invalid", error: "יש להזין פעם אחת כל יום בשבוע",
    });
    expect(await saveWeeklyHoursAuthed(store, weekRows("18:00").slice(0, 6))).toEqual({
      ok: false, code: "invalid", error: "יש להזין פעם אחת כל יום בשבוע",
    });
    expect(await prisma.workingHours.findMany({ orderBy: { weekday: "asc" } })).toMatchObject(
      weekRows(),
    );
  });

  it("rejects misaligned weekly opening while allowing an unaligned close", async () => {
    const store = await authedCookies();
    const rows = weekRows("19:15");
    rows[1].openTime = "09:15";

    expect(await saveWeeklyHoursAuthed(store, rows)).toEqual({
      ok: false, code: "invalid", error: "שעת הפתיחה חייבת להתאים למרווח התורים",
    });
    expect(await prisma.workingHours.findMany({ orderBy: { weekday: "asc" } })).toMatchObject(
      weekRows(),
    );

    rows[1].openTime = "09:30";
    expect(await saveWeeklyHoursAuthed(store, rows)).toEqual({ ok: true });
    expect(await prisma.workingHours.findUnique({ where: { weekday: 1 } })).toMatchObject({
      openTime: "09:30", closeTime: "19:15",
    });
  });

  it("replaces a closure with custom hours and custom hours with a closure", async () => {
    const store = await authedCookies();
    await prisma.closedDate.create({ data: { date: TUESDAY } });

    expect(
      await setExceptionHoursAuthed(store, {
        date: TUESDAY,
        openTime: "10:00",
        closeTime: "16:00",
      }),
    ).toEqual({ ok: true });
    expect(await prisma.closedDate.findUnique({ where: { date: TUESDAY } })).toBeNull();
    expect(await prisma.hoursOverride.findUnique({ where: { date: TUESDAY } })).toMatchObject({
      openTime: "10:00",
      closeTime: "16:00",
    });

    expect(await closeExceptionDayAuthed(store, TUESDAY)).toEqual({ ok: true });
    expect(await prisma.hoursOverride.findUnique({ where: { date: TUESDAY } })).toBeNull();
    expect(await prisma.closedDate.findUnique({ where: { date: TUESDAY } })).not.toBeNull();
  });

  it("rejects a misaligned date override without removing an existing closure", async () => {
    const store = await authedCookies();
    await prisma.closedDate.create({ data: { date: TUESDAY } });

    expect(await setExceptionHoursAuthed(store, {
      date: TUESDAY, openTime: "09:15", closeTime: "16:15",
    })).toEqual({
      ok: false, code: "invalid", error: "שעת הפתיחה חייבת להתאים למרווח התורים",
    });
    expect(await prisma.closedDate.findUnique({ where: { date: TUESDAY } })).not.toBeNull();
    expect(await prisma.hoursOverride.findUnique({ where: { date: TUESDAY } })).toBeNull();

    expect(await setExceptionHoursAuthed(store, {
      date: TUESDAY, openTime: "09:30", closeTime: "16:15",
    })).toEqual({ ok: true });
  });

  it("rejects an interval change incompatible with weekly hours or date overrides", async () => {
    const store = await authedCookies();
    const rows = weekRows();
    rows[1].openTime = "09:30";
    expect(await saveWeeklyHoursAuthed(store, rows)).toEqual({ ok: true });

    expect(await saveSlotIntervalAuthed(store, 60)).toEqual({
      ok: false, code: "invalid", error: "שעת הפתיחה חייבת להתאים למרווח התורים",
    });
    expect(await prisma.settings.findUnique({ where: { id: 1 } })).toMatchObject({
      slotIntervalMinutes: 30,
    });

    rows[1].openTime = "09:00";
    expect(await saveWeeklyHoursAuthed(store, rows)).toEqual({ ok: true });
    expect(await setExceptionHoursAuthed(store, {
      date: TUESDAY, openTime: "09:30", closeTime: "16:15",
    })).toEqual({ ok: true });
    expect(await saveSlotIntervalAuthed(store, 60)).toEqual({
      ok: false, code: "invalid", error: "שעת הפתיחה חייבת להתאים למרווח התורים",
    });
    expect(await prisma.settings.findUnique({ where: { id: 1 } })).toMatchObject({
      slotIntervalMinutes: 30,
    });

    expect(await removeExceptionAuthed(store, TUESDAY)).toEqual({ ok: true });
    expect(await saveSlotIntervalAuthed(store, 20)).toEqual({ ok: true });
    expect(await prisma.settings.findUnique({ where: { id: 1 } })).toMatchObject({
      slotIntervalMinutes: 20,
    });
  });

  it("accepts only 20, 30, and 60 for newly saved slot intervals", async () => {
    const store = await authedCookies();

    expect(await saveSlotIntervalAuthed(store, 20)).toEqual({ ok: true });
    expect(await saveSlotIntervalAuthed(store, 30)).toEqual({ ok: true });
    expect(await saveSlotIntervalAuthed(store, 60)).toEqual({ ok: true });
    expect(await saveSlotIntervalAuthed(store, 15)).toMatchObject({ ok: false, code: "invalid" });
    expect(await saveSlotIntervalAuthed(store, 45)).toMatchObject({ ok: false, code: "invalid" });
    expect(await prisma.settings.findUnique({ where: { id: 1 } })).toMatchObject({
      slotIntervalMinutes: 60,
    });
  });

  it("closes an inclusive range, replaces overrides, and leaves outside dates and appointments unchanged", async () => {
    const store = await authedCookies();
    const service = await prisma.service.create({
      data: { name: "שירות", durationMinutes: 30, sortOrder: 1 },
    });
    const outsideDate = "2026-09-18";
    await prisma.hoursOverride.createMany({
      data: [
        { date: TUESDAY, openTime: "10:00", closeTime: "16:00" },
        { date: outsideDate, openTime: "11:00", closeTime: "15:00" },
      ],
    });
    const appointment = await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: null,
        serviceId: service.id,
        startAt: fromZonedTime(`${TUESDAY}T12:00:00`, TZ),
        endAt: fromZonedTime(`${TUESDAY}T12:30:00`, TZ),
        status: "scheduled",
      },
    });

    expect(await closeExceptionRangeAuthed(store, {
      startDate: TUESDAY,
      endDate: "2026-09-17",
    })).toEqual({ ok: true });

    expect((await prisma.closedDate.findMany({ orderBy: { date: "asc" } })).map((row) => row.date))
      .toEqual(["2026-09-15", "2026-09-16", "2026-09-17"]);
    expect(await prisma.hoursOverride.findUnique({ where: { date: TUESDAY } })).toBeNull();
    expect(await prisma.hoursOverride.findUnique({ where: { date: outsideDate } })).not.toBeNull();
    expect(await prisma.closedDate.findUnique({ where: { date: outsideDate } })).toBeNull();
    expect(await prisma.appointment.findUnique({ where: { id: appointment.id } })).toMatchObject({
      status: "scheduled",
    });
  });

  it("treats an omitted or identical range end as one day and rejects an earlier end", async () => {
    const store = await authedCookies();

    expect(await closeExceptionRangeAuthed(store, { startDate: TUESDAY })).toEqual({ ok: true });
    expect(await prisma.closedDate.count()).toBe(1);
    expect(await closeExceptionRangeAuthed(store, {
      startDate: TUESDAY,
      endDate: TUESDAY,
    })).toEqual({ ok: true });
    expect(await prisma.closedDate.count()).toBe(1);

    expect(await closeExceptionRangeAuthed(store, {
      startDate: "2026-09-17",
      endDate: TUESDAY,
    })).toEqual({
      ok: false,
      code: "invalid",
      error: "תאריך הסיום לא יכול להיות מוקדם מתאריך ההתחלה",
    });
    expect(await prisma.closedDate.count()).toBe(1);
  });

  it("removes either kind of one-day change", async () => {
    const store = await authedCookies();
    await prisma.closedDate.create({ data: { date: TUESDAY } });

    expect(await removeExceptionAuthed(store, TUESDAY)).toEqual({ ok: true });
    expect(await prisma.closedDate.findUnique({ where: { date: TUESDAY } })).toBeNull();
    expect(await prisma.hoursOverride.findUnique({ where: { date: TUESDAY } })).toBeNull();
  });

  it("keeps existing appointments scheduled after weekly shrink and date closure", async () => {
    const store = await authedCookies();
    const service = await prisma.service.create({
      data: { name: "שירות", durationMinutes: 30, sortOrder: 1 },
    });
    const startAt = fromZonedTime(`${TUESDAY}T17:00:00`, TZ);
    const appointment = await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt,
        endAt: addMinutes(startAt, 30),
        status: "scheduled",
      },
    });

    expect(await saveWeeklyHoursAuthed(store, weekRows("16:00"))).toEqual({ ok: true });
    expect(await closeExceptionDayAuthed(store, TUESDAY)).toEqual({ ok: true });

    const stored = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(stored?.status).toBe("scheduled");
  });

  it("rejects every hours mutation without an admin session", async () => {
    const store = memoryCookies();

    expect(await saveWeeklyHoursAuthed(store, weekRows())).toEqual({
      ok: false,
      code: "unauthenticated",
    });
    expect(
      await setExceptionHoursAuthed(store, {
        date: TUESDAY,
        openTime: "10:00",
        closeTime: "16:00",
      }),
    ).toEqual({ ok: false, code: "unauthenticated" });
    expect(await closeExceptionDayAuthed(store, TUESDAY)).toEqual({
      ok: false,
      code: "unauthenticated",
    });
    expect(await closeExceptionRangeAuthed(store, {
      startDate: TUESDAY,
      endDate: "2026-09-17",
    })).toEqual({ ok: false, code: "unauthenticated" });
    expect(await removeExceptionAuthed(store, TUESDAY)).toEqual({
      ok: false,
      code: "unauthenticated",
    });

    expect(await prisma.closedDate.count()).toBe(0);
    expect(await prisma.hoursOverride.count()).toBe(0);
  });

  it("saves normalized business details without changing the calendar note", async () => {
    const store = await authedCookies();
    await prisma.settings.update({
      where: { id: 1 },
      data: { calendarNote: "הערה קיימת" },
    });

    expect(
      await saveShopTextAuthed(store, {
        businessName: "  העסק  ",
        providerName: "  נותן השירות החדש  ",
        tagline: "  שירות טובה  ",
        address: "  רחוב הראשי 1  ",
        phone: "  03-1234567  ",
        whatsappPhone: "+972 50-123-4567",
      }),
    ).toEqual({ ok: true });

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(settings).toMatchObject({
      businessName: "העסק",
      providerName: "נותן השירות החדש",
      tagline: "שירות טובה",
      address: "רחוב הראשי 1",
      phone: "03-1234567",
      whatsappPhone: "972501234567",
      calendarNote: "הערה קיימת",
    });
  });

  it("rejects an empty business name without changing business details", async () => {
    const store = await authedCookies();

    expect(
      await saveShopTextAuthed(store, {
        businessName: "   ",
        providerName: "נותן השירות",
        tagline: "תיאור חדש",
        address: "כתובת חדשה",
        phone: "031234567",
        whatsappPhone: "972501234567",
      }),
    ).toEqual({
      ok: false,
      code: "invalid",
      error: "נא להזין שם חנות",
      field: "businessName",
    });

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(settings).toMatchObject({ businessName: "שם העסק", tagline: "", address: "" });
  });

  it("saves calendar details independently from business details", async () => {
    const store = await authedCookies();

    expect(await saveCalendarNoteAuthed(store, "  נא להגיע חמש דקות לפני התור  ")).toEqual({
      ok: true,
    });

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(settings).toMatchObject({
      businessName: "שם העסק",
      phone: "0500000000",
      calendarNote: "נא להגיע חמש דקות לפני התור",
    });
  });

  it("saves and clears a home notice with an optional expiry", async () => {
    const store = await authedCookies();

    expect(
      await saveDoorNoticeAuthed(store, {
        text: "  סגור בערב החג  ",
        until: "2026-09-22",
      }),
    ).toEqual({ ok: true });
    expect(await prisma.settings.findUnique({ where: { id: 1 } })).toMatchObject({
      doorNotice: "סגור בערב החג",
      doorNoticeUntil: "2026-09-22",
    });

    expect(await clearDoorNoticeAuthed(store)).toEqual({ ok: true });
    expect(await prisma.settings.findUnique({ where: { id: 1 } })).toMatchObject({
      doorNotice: "",
      doorNoticeUntil: "",
    });
  });

  it("rejects an invalid notice expiry without changing the saved notice", async () => {
    const store = await authedCookies();
    await prisma.settings.update({
      where: { id: 1 },
      data: { doorNotice: "הודעה קיימת", doorNoticeUntil: "2026-09-20" },
    });

    expect(
      await saveDoorNoticeAuthed(store, { text: "הודעה חדשה", until: "20/09/2026" }),
    ).toEqual({
      ok: false,
      code: "invalid",
      error: "תאריך לא תקין",
      field: "doorNoticeUntil",
    });
    expect(await prisma.settings.findUnique({ where: { id: 1 } })).toMatchObject({
      doorNotice: "הודעה קיימת",
      doorNoticeUntil: "2026-09-20",
    });
  });

  it("rejects every shop-content mutation without an admin session", async () => {
    const store = memoryCookies();

    expect(
      await saveShopTextAuthed(store, {
        businessName: "שם חדש",
        providerName: "נותן השירות",
        tagline: "תיאור",
        address: "כתובת",
        phone: "031234567",
        whatsappPhone: "972501234567",
      }),
    ).toEqual({ ok: false, code: "unauthenticated" });
    expect(await saveCalendarNoteAuthed(store, "הערה חדשה")).toEqual({
      ok: false,
      code: "unauthenticated",
    });
    expect(
      await saveDoorNoticeAuthed(store, { text: "הודעה", until: "" }),
    ).toEqual({ ok: false, code: "unauthenticated" });
    expect(await clearDoorNoticeAuthed(store)).toEqual({
      ok: false,
      code: "unauthenticated",
    });

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(settings).toMatchObject({
      businessName: "שם העסק",
      calendarNote: "",
      doorNotice: "",
    });
  });
});
