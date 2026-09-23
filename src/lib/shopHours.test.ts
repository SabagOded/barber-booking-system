import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { getAvailableSlots } from "./availability";
import { prisma } from "./prisma";
import { prepareTestDb, resetTestDb } from "@/test/resetTestDb";
import {
  formatTemplateHoursParts,
  isDoorNoticeActive,
  listUpcomingExceptions,
} from "./shopHours";

const TZ = "Asia/Jerusalem";
const FRIDAY_A = "2026-09-18";
const FRIDAY_B = "2026-09-25";
const THURSDAY = "2026-09-17";

function jerusalem(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, TZ);
}

function clocks(slots: { startAt: Date }[]): string[] {
  return slots.map((slot) => formatInTimeZone(slot.startAt, TZ, "HH:mm"));
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
  const service = await prisma.service.create({
    data: { name: "שירות", durationMinutes: 30, priceAgorot: 8000, sortOrder: 1 },
  });
  await prisma.workingHours.createMany({
    data: [
      { weekday: 0, isOpen: true, openTime: "09:00", closeTime: "19:00" },
      { weekday: 1, isOpen: true, openTime: "09:00", closeTime: "19:00" },
      { weekday: 2, isOpen: true, openTime: "09:00", closeTime: "19:00" },
      { weekday: 3, isOpen: true, openTime: "09:00", closeTime: "19:00" },
      { weekday: 4, isOpen: true, openTime: "09:00", closeTime: "19:00" },
      { weekday: 5, isOpen: true, openTime: "09:00", closeTime: "14:00" },
      { weekday: 6, isOpen: false, openTime: "00:00", closeTime: "00:00" },
    ],
  });
  return { service };
}

describe("effective hours and door notice", () => {
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

  it("Friday override to 15:00 extends only that Friday", async () => {
    const { service } = await seedBase();
    await prisma.hoursOverride.create({
      data: { date: FRIDAY_A, openTime: "09:00", closeTime: "15:00" },
    });
    const now = jerusalem(FRIDAY_A, "08:00");
    const overridden = clocks(
      await getAvailableSlots({ serviceId: service.id, date: FRIDAY_A, now }),
    );
    const other = clocks(
      await getAvailableSlots({
        serviceId: service.id,
        date: FRIDAY_B,
        now: jerusalem(FRIDAY_B, "08:00"),
      }),
    );
    expect(overridden).toContain("14:30");
    expect(overridden.at(-1)).toBe("14:30");
    expect(other).not.toContain("14:30");
    expect(other.at(-1)).toBe("13:30");
  });

  it("shorter Thursday override hides late starts but keeps an existing 17:00 row", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(THURSDAY, "17:00");
    const existing = await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt,
        endAt: addMinutes(startAt, 30),
        status: "scheduled",
      },
    });
    await prisma.hoursOverride.create({
      data: { date: THURSDAY, openTime: "09:00", closeTime: "16:00" },
    });
    const slots = clocks(
      await getAvailableSlots({
        serviceId: service.id,
        date: THURSDAY,
        now: jerusalem(THURSDAY, "08:00"),
      }),
    );
    expect(slots).not.toContain("16:30");
    expect(slots).not.toContain("17:00");
    const stored = await prisma.appointment.findUnique({ where: { id: existing.id } });
    expect(stored?.status).toBe("scheduled");
  });

  it("closed exception day has no new slots and does not cancel an existing row", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(THURSDAY, "10:00");
    const existing = await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt,
        endAt: addMinutes(startAt, 30),
        status: "scheduled",
      },
    });
    await prisma.closedDate.create({ data: { date: THURSDAY } });
    const slots = await getAvailableSlots({
      serviceId: service.id,
      date: THURSDAY,
      now: jerusalem(THURSDAY, "08:00"),
    });
    expect(slots).toEqual([]);
    const stored = await prisma.appointment.findUnique({ where: { id: existing.id } });
    expect(stored?.status).toBe("scheduled");
  });

  it("door notice expiry and empty text hide the banner", () => {
    expect(isDoorNoticeActive("שעות מיוחדות", "", "2026-09-12")).toBe(true);
    expect(isDoorNoticeActive("שעות מיוחדות", "2026-09-12", "2026-09-12")).toBe(true);
    expect(isDoorNoticeActive("שעות מיוחדות", "2026-09-11", "2026-09-12")).toBe(false);
    expect(isDoorNoticeActive("  ", "2026-09-20", "2026-09-12")).toBe(false);
    expect(isDoorNoticeActive("", "", "2026-09-12")).toBe(false);
  });

  it("landing template chips stay the weekly pattern when an exception exists", async () => {
    await seedBase();
    await prisma.hoursOverride.create({
      data: { date: FRIDAY_A, openTime: "10:00", closeTime: "16:00" },
    });
    const hours = await prisma.workingHours.findMany({ orderBy: { weekday: "asc" } });
    const parts = formatTemplateHoursParts(hours);
    expect(parts.some((part) => part.includes("09:00") && part.includes("19:00"))).toBe(true);
    expect(parts.some((part) => part.includes("ו׳") && part.includes("14:00"))).toBe(true);
    expect(parts.join(" ")).not.toContain("10:00–16:00");

    const exceptions = await listUpcomingExceptions(jerusalem("2026-09-12", "08:00"));
    expect(exceptions.some((row) => row.date === FRIDAY_A && row.rule === "10:00–16:00")).toBe(true);
  });
});
