import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { getAvailableSlots, getDaySlotGrid } from "./availability";
import { prisma } from "./prisma";
import { prepareTestDb, resetTestDb } from "@/test/resetTestDb";

const TZ = "Asia/Jerusalem";
const MONDAY = "2026-09-14";
const SATURDAY = "2026-09-19";

function jerusalem(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, TZ);
}

function slotClocks(slots: { startAt: Date }[]): string[] {
  return slots.map((slot) => formatInTimeZone(slot.startAt, TZ, "HH:mm"));
}

async function seedBase(overrides?: { slotIntervalMinutes?: number }) {
  await prisma.settings.create({
    data: {
      id: 1,
      businessName: "שם העסק",
      providerName: "נותן השירות",
      phone: "0500000000",
      whatsappPhone: "972500000000",
      timezone: TZ,
      slotIntervalMinutes: overrides?.slotIntervalMinutes ?? 30,
    },
  });

  const service = await prisma.service.create({
    data: {
      name: "שירות בסיסי",
      durationMinutes: 30,
      priceAgorot: 8000,
      sortOrder: 1,
    },
  });

  const extendedService = await prisma.service.create({
    data: {
      name: "שירות מורחב",
      durationMinutes: 45,
      priceAgorot: 11000,
      sortOrder: 2,
    },
  });

  const hours = [
    { weekday: 0, isOpen: true, openTime: "09:00", closeTime: "19:00" },
    { weekday: 1, isOpen: true, openTime: "09:00", closeTime: "19:00" },
    { weekday: 2, isOpen: true, openTime: "09:00", closeTime: "19:00" },
    { weekday: 3, isOpen: true, openTime: "09:00", closeTime: "19:00" },
    { weekday: 4, isOpen: true, openTime: "09:00", closeTime: "19:00" },
    { weekday: 5, isOpen: true, openTime: "09:00", closeTime: "14:00" },
    { weekday: 6, isOpen: false, openTime: "00:00", closeTime: "00:00" },
  ];

  await prisma.workingHours.createMany({ data: hours });

  return { service, extendedService };
}

describe("getAvailableSlots", () => {
  beforeAll(prepareTestDb);

  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("respects working hours", async () => {
    const { service } = await seedBase();
    const now = jerusalem(MONDAY, "08:00");

    const slots = await getAvailableSlots({
      serviceId: service.id,
      date: MONDAY,
      now,
    });
    const times = slotClocks(slots);

    expect(times[0]).toBe("09:00");
    expect(times.at(-1)).toBe("18:30");
    expect(times).not.toContain("08:30");
    expect(times).not.toContain("19:00");
  });

  it("returns no slots on Saturday", async () => {
    const { service } = await seedBase();

    const slots = await getAvailableSlots({
      serviceId: service.id,
      date: SATURDAY,
      now: jerusalem("2026-09-18", "08:00"),
    });

    expect(slots).toEqual([]);
  });

  it("excludes slots that overlap an existing appointment", async () => {
    const { service } = await seedBase();

    await prisma.appointment.create({
      data: {
        customerName: "Test",
        customerPhone: "0500000000",
        serviceId: service.id,
        startAt: jerusalem(MONDAY, "10:00"),
        endAt: jerusalem(MONDAY, "10:30"),
        status: "scheduled",
      },
    });

    const slots = await getAvailableSlots({
      serviceId: service.id,
      date: MONDAY,
      now: jerusalem(MONDAY, "08:00"),
    });
    const times = slotClocks(slots);

    expect(times).not.toContain("10:00");
    expect(times).toContain("09:30");
    expect(times).toContain("10:30");
  });

  it("excludes slots that overlap a time block", async () => {
    const { service } = await seedBase();

    await prisma.timeBlock.create({
      data: {
        startAt: jerusalem(MONDAY, "13:00"),
        endAt: jerusalem(MONDAY, "14:00"),
        reason: "Lunch",
      },
    });

    const slots = await getAvailableSlots({
      serviceId: service.id,
      date: MONDAY,
      now: jerusalem(MONDAY, "08:00"),
    });
    const times = slotClocks(slots);

    expect(times).not.toContain("13:00");
    expect(times).not.toContain("13:30");
    expect(times).toContain("12:30");
    expect(times).toContain("14:00");
  });

  it("rejects a start that cannot fit the full duration before close", async () => {
    const { extendedService } = await seedBase();

    const slots = await getAvailableSlots({
      serviceId: extendedService.id,
      date: MONDAY,
      now: jerusalem(MONDAY, "08:00"),
    });
    const times = slotClocks(slots);

    expect(times).toContain("18:00");
    expect(times).not.toContain("18:30");
  });

  it("rejects past slots", async () => {
    const { service } = await seedBase();

    const slots = await getAvailableSlots({
      serviceId: service.id,
      date: MONDAY,
      now: jerusalem(MONDAY, "12:00"),
    });
    const times = slotClocks(slots);

    expect(times).not.toContain("09:00");
    expect(times).not.toContain("11:30");
    expect(times).not.toContain("12:00");
    expect(times[0]).toBe("12:30");
  });

  it("builds a valid slot grid with a 20-minute interval", async () => {
    const { service } = await seedBase({ slotIntervalMinutes: 20 });

    const slots = await getAvailableSlots({
      serviceId: service.id,
      date: MONDAY,
      now: jerusalem(MONDAY, "08:00"),
    });
    const times = slotClocks(slots);

    expect(times).toContain("09:00");
    expect(times).toContain("09:20");
    expect(times).toContain("09:40");
  });

  it.each([15, 45])("continues to read a legacy %i-minute interval", async (slotIntervalMinutes) => {
    const { service } = await seedBase({ slotIntervalMinutes });

    const slots = await getAvailableSlots({
      serviceId: service.id,
      date: MONDAY,
      now: jerusalem(MONDAY, "08:00"),
    });

    expect(slotClocks(slots).slice(0, 3)).toEqual(
      slotIntervalMinutes === 15
        ? ["09:00", "09:15", "09:30"]
        : ["09:00", "09:45", "10:30"],
    );
  });

  it("keeps taken, past, and blocked hours visible on the day grid", async () => {
    const { service } = await seedBase();

    await prisma.appointment.create({
      data: {
        customerName: "Test",
        customerPhone: "0500000000",
        serviceId: service.id,
        startAt: jerusalem(MONDAY, "10:00"),
        endAt: jerusalem(MONDAY, "10:30"),
        status: "scheduled",
      },
    });

    await prisma.timeBlock.create({
      data: {
        startAt: jerusalem(MONDAY, "13:00"),
        endAt: jerusalem(MONDAY, "14:00"),
        reason: "Lunch",
      },
    });

    const morning = await getDaySlotGrid({
      serviceId: service.id,
      date: MONDAY,
      now: jerusalem(MONDAY, "08:00"),
    });
    const morningByTime = Object.fromEntries(
      morning.map((slot) => [formatInTimeZone(slot.startAt, TZ, "HH:mm"), slot.status]),
    );

    expect(morningByTime["09:00"]).toBe("available");
    expect(morningByTime["10:00"]).toBe("taken");
    expect(morningByTime["13:00"]).toBe("taken");
    expect(morningByTime["13:30"]).toBe("taken");
    expect(morningByTime["14:00"]).toBe("available");

    const afternoon = await getDaySlotGrid({
      serviceId: service.id,
      date: MONDAY,
      now: jerusalem(MONDAY, "12:00"),
    });
    const afternoonByTime = Object.fromEntries(
      afternoon.map((slot) => [formatInTimeZone(slot.startAt, TZ, "HH:mm"), slot.status]),
    );

    expect(afternoonByTime["09:00"]).toBe("past");
    expect(afternoonByTime["12:00"]).toBe("past");
    expect(afternoonByTime["12:30"]).toBe("available");
  });

  it("Friday 45-minute service cannot start if it would end after 14:00; 30-minute still can", async () => {
    const { service, extendedService } = await seedBase();
    const friday = "2026-09-18";
    const now = jerusalem(friday, "08:00");

    const long = slotClocks(
      await getAvailableSlots({ serviceId: extendedService.id, date: friday, now }),
    );
    const short = slotClocks(
      await getAvailableSlots({ serviceId: service.id, date: friday, now }),
    );

    expect(long).toContain("13:00");
    expect(long).not.toContain("13:30");
    expect(short).toContain("13:30");
  });

  it("20-minute service still starts only on the 30-minute interval", async () => {
    await seedBase();
    const trim = await prisma.service.create({
      data: { name: "פגישת ייעוץ", durationMinutes: 20, priceAgorot: 5000, sortOrder: 3 },
    });
    const times = slotClocks(
      await getAvailableSlots({
        serviceId: trim.id,
        date: MONDAY,
        now: jerusalem(MONDAY, "08:00"),
      }),
    );
    expect(times).toContain("09:00");
    expect(times).toContain("09:30");
    expect(times).not.toContain("09:20");
    expect(times.at(-1)).toBe("18:30");
  });

  it("does not invent duplicate slots on Israel DST spring-forward or fall-back", async () => {
    const { service } = await seedBase();
    const springFriday = slotClocks(
      await getAvailableSlots({
        serviceId: service.id,
        date: "2026-03-27",
        now: jerusalem("2026-03-27", "08:00"),
      }),
    );
    expect(new Set(springFriday).size).toBe(springFriday.length);
    expect(springFriday[0]).toBe("09:00");
    expect(springFriday.at(-1)).toBe("13:30");

    const fallSunday = slotClocks(
      await getAvailableSlots({
        serviceId: service.id,
        date: "2026-10-25",
        now: jerusalem("2026-10-25", "08:00"),
      }),
    );
    expect(new Set(fallSunday).size).toBe(fallSunday.length);
    expect(fallSunday[0]).toBe("09:00");
    expect(fallSunday.at(-1)).toBe("18:30");
  });
});
