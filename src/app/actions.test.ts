import { fromZonedTime } from "date-fns-tz";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { bookAppointment, getBookableDays, getSlots } from "./actions";
import { prisma } from "@/lib/prisma";
import { prepareTestDb, resetTestDb } from "@/test/resetTestDb";

const fault = vi.hoisted(() => ({ active: false }));

vi.mock("@/lib/availability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/availability")>();
  return {
    ...actual,
    buildDaySlotGrid: (...args: Parameters<typeof actual.buildDaySlotGrid>) => {
      if (fault.active) {
        throw new Error("database unavailable");
      }
      return actual.buildDaySlotGrid(...args);
    },
    getAvailableSlots: (...args: Parameters<typeof actual.getAvailableSlots>) =>
      fault.active ? Promise.reject(new Error("database unavailable")) : actual.getAvailableSlots(...args),
    getDaySlotGrid: (...args: Parameters<typeof actual.getDaySlotGrid>) =>
      fault.active ? Promise.reject(new Error("database unavailable")) : actual.getDaySlotGrid(...args),
  };
});

const at = (date: string, time: string) => fromZonedTime(`${date}T${time}:00`, "Asia/Jerusalem");

async function seed() {
  await prisma.settings.create({
    data: {
      id: 1, businessName: "Shop", providerName: "Barber", phone: "0500000000",
      whatsappPhone: "972500000000", timezone: "Asia/Jerusalem", slotIntervalMinutes: 30,
    },
  });
  const service = await prisma.service.create({
    data: { name: "Cut", durationMinutes: 30, sortOrder: 0 },
  });
  await prisma.workingHours.createMany({
    data: Array.from({ length: 7 }, (_, weekday) => ({
      weekday, isOpen: true, openTime: "09:00", closeTime: "19:00",
    })),
  });
  return service;
}

describe("public availability actions", () => {
  beforeAll(prepareTestDb);
  beforeEach(resetTestDb);
  afterEach(async () => {
    fault.active = false;
    vi.useRealTimers();
    await resetTestDb();
  });
  afterAll(async () => prisma.$disconnect());

  it("keeps a phone mandatory for public booking", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at("2026-09-14", "08:00"));
    const service = await seed();

    expect(await bookAppointment({
      serviceId: service.id,
      startAtIso: at("2026-09-14", "10:00").toISOString(),
      customerName: "דוד כהן",
      customerPhone: "",
    })).toEqual({ ok: false, code: "validation_phone" });
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("propagates unexpected availability failures instead of reporting full or empty", async () => {
    const service = await seed();
    fault.active = true;

    await expect(getBookableDays(service.id)).rejects.toThrow("database unavailable");
    await expect(getSlots(service.id, "2026-09-23")).rejects.toThrow("database unavailable");
  });

  it("still reports genuinely full days and empty closed-day slots", async () => {
    const service = await seed();
    const days = await getBookableDays(service.id);
    const openDay = days.find((day) => day.available && !day.isToday);
    expect(openDay).toBeDefined();
    if (!openDay) return;

    await prisma.timeBlock.create({
      data: { startAt: at(openDay.date, "09:00"), endAt: at(openDay.date, "19:00") },
    });
    expect((await getBookableDays(service.id)).find((day) => day.date === openDay.date)?.occupancy)
      .toBe("full");

    await prisma.closedDate.create({ data: { date: openDay.date } });
    expect(await getSlots(service.id, openDay.date)).toEqual([]);
  });

  it("rejects a stale slot after its date is closed and returns refreshed day availability", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at("2026-09-14", "08:00"));
    const service = await seed();
    const date = "2026-09-15";
    const loadedDay = (await getBookableDays(service.id)).find((day) => day.date === date);
    const [loadedSlot] = await getSlots(service.id, date);

    expect(loadedDay).toMatchObject({ available: true, occupancy: "open" });
    expect(loadedSlot).toBeDefined();
    if (!loadedSlot) return;

    await prisma.closedDate.create({ data: { date } });

    expect(await bookAppointment({
      serviceId: service.id,
      startAtIso: loadedSlot.startAtIso,
      customerName: "דוד כהן",
      customerPhone: "0501234567",
    })).toEqual({ ok: false, code: "slot_unavailable" });
    expect((await getBookableDays(service.id)).find((day) => day.date === date))
      .toMatchObject({ available: false, occupancy: "closed" });
  });

  it("builds the whole window from bulk-prefetched data with matching day semantics", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at("2026-09-14", "08:00"));
    const service = await seed();

    await Promise.all([
      prisma.timeBlock.create({
        data: { startAt: at("2026-09-15", "09:00"), endAt: at("2026-09-15", "19:00") },
      }),
      prisma.closedDate.create({ data: { date: "2026-09-16" } }),
      prisma.hoursOverride.create({
        data: { date: "2026-09-17", openTime: "12:00", closeTime: "13:00" },
      }),
      prisma.appointment.create({
        data: {
          customerName: "Overlap",
          customerPhone: "0501234567",
          serviceId: service.id,
          startAt: at("2026-09-17", "12:00"),
          endAt: at("2026-09-17", "12:30"),
          status: "scheduled",
        },
      }),
      prisma.timeBlock.create({
        data: { startAt: at("2026-09-17", "12:30"), endAt: at("2026-09-17", "13:00") },
      }),
    ]);

    const days = await getBookableDays(service.id);
    const byDate = new Map(days.map((day) => [day.date, day]));

    expect(byDate.get("2026-09-13")?.occupancy).toBe("past");
    expect(byDate.get("2026-09-14")).toMatchObject({ occupancy: "open", available: true });
    expect(byDate.get("2026-09-15")).toMatchObject({ occupancy: "full", available: false });
    expect(byDate.get("2026-09-16")).toMatchObject({ occupancy: "closed", available: false });
    expect(byDate.get("2026-09-17")).toMatchObject({ occupancy: "full", available: false });
    expect(byDate.get("2026-09-18")).toMatchObject({ occupancy: "open", available: true });
  });

  it("treats missing shop settings as a failure, not lack of availability", async () => {
    const service = await seed();
    await prisma.settings.delete({ where: { id: 1 } });
    await expect(getBookableDays(service.id)).rejects.toThrow("Settings not found");
    await expect(getSlots(service.id, "2026-09-23")).rejects.toThrow("Settings not found");
  });
});
