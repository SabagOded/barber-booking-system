import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoServices, demoSettings, demoWorkingHours } from "../../prisma/demoBaseline";
import { prisma } from "./prisma";
import { resetDemoIfExpired, resetDemoManually } from "./demoReset";
import { prepareTestDb, resetTestDb } from "@/test/resetTestDb";

describe("shared demo reset", () => {
  const previousDemoMode = process.env.DEMO_MODE;
  beforeAll(prepareTestDb);
  beforeEach(async () => {
    await resetTestDb();
    process.env.DEMO_MODE = "true";
    await prisma.settings.create({ data: { id: 1, ...demoSettings, businessName: "Visitor edit" } });
    await prisma.service.create({ data: { name: "Visitor service", durationMinutes: 30, sortOrder: 1 } });
    await prisma.workingHours.create({ data: { weekday: 0, isOpen: false, openTime: "00:00", closeTime: "00:00" } });
    await prisma.closedDate.create({ data: { date: "2026-10-01" } });
    await prisma.hoursOverride.create({ data: { date: "2026-10-02", openTime: "10:00", closeTime: "16:00" } });
    await prisma.timeBlock.create({ data: { startAt: new Date("2026-10-01T10:00:00Z"), endAt: new Date("2026-10-01T10:30:00Z") } });
    await prisma.portfolioImage.create({ data: { settingsId: 1, storageKey: "test/image", sortOrder: 1 } });
    const service = await prisma.service.findFirstOrThrow();
    await prisma.appointment.create({ data: { serviceId: service.id, customerName: "Visitor", customerPhone: "0500000000", startAt: new Date("2026-10-01T10:00:00Z"), endAt: new Date("2026-10-01T10:30:00Z"), status: "cancelled" } });
  });
  afterEach(async () => {
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
    await resetTestDb();
  });
  afterAll(async () => prisma.$disconnect());

  it("refuses manual and automatic destructive reset outside demo mode", async () => {
    process.env.DEMO_MODE = "false";
    expect(await resetDemoManually()).toBe(false);
    expect(await resetDemoIfExpired()).toBe(false);
    expect(await prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).toMatchObject({ businessName: "Visitor edit" });
    expect(await prisma.appointment.count()).toBe(1);
  });

  it("restores the current seed baseline and removes visitor state", async () => {
    expect(await resetDemoManually()).toBe(true);
    expect(await prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).toMatchObject(demoSettings);
    expect(await prisma.service.findMany({ orderBy: { sortOrder: "asc" }, select: { name: true, durationMinutes: true, priceAgorot: true, sortOrder: true } })).toEqual(demoServices);
    expect(await prisma.workingHours.findMany({ orderBy: { weekday: "asc" }, select: { weekday: true, isOpen: true, openTime: true, closeTime: true } })).toEqual(demoWorkingHours);
    expect(await prisma.appointment.count()).toBe(0);
    expect(await prisma.timeBlock.count()).toBe(0);
    expect(await prisma.closedDate.count()).toBe(0);
    expect(await prisma.hoursOverride.count()).toBe(0);
    expect(await prisma.portfolioImage.count()).toBe(0);
    expect((await prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).demoResetAt).toBeInstanceOf(Date);
  });

  it("resets lazily after about an hour and only once for concurrent access", async () => {
    const start = new Date("2026-10-01T00:00:00Z");
    await prisma.settings.update({ where: { id: 1 }, data: { demoResetAt: start } });
    expect(await resetDemoIfExpired(new Date(start.getTime() + 59 * 60_000))).toBe(false);
    const results = await Promise.all([
      resetDemoIfExpired(new Date(start.getTime() + 60 * 60_000)),
      resetDemoIfExpired(new Date(start.getTime() + 60 * 60_000)),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.appointment.count()).toBe(0);
    expect(await prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).toMatchObject({ demoResetAt: new Date(start.getTime() + 60 * 60_000) });
  });
});
