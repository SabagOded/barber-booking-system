import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { prepareTestDb, resetTestDb } from "./resetTestDb";

describe("resetTestDb", () => {
  beforeAll(prepareTestDb);
  beforeEach(resetTestDb);
  afterEach(resetTestDb);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("deletes every mutable model in relation-aware order", async () => {
    const service = await prisma.service.create({
      data: { name: "Reset test", durationMinutes: 30 },
    });
    const startAt = new Date("2026-09-14T07:00:00.000Z");

    await prisma.settings.create({
      data: {
        id: 1,
        businessName: "Reset test",
        providerName: "Reset test",
        phone: "0500000000",
        whatsappPhone: "972500000000",
      },
    });
    await prisma.portfolioImage.create({
      data: {
        settingsId: 1,
        storageKey: "portfolio/00000000-0000-4000-8000-000000000000.webp",
        sortOrder: 0,
      },
    });
    await prisma.workingHours.create({
      data: { weekday: 1, isOpen: true, openTime: "09:00", closeTime: "19:00" },
    });
    await prisma.closedDate.create({ data: { date: "2026-09-15" } });
    await prisma.hoursOverride.create({
      data: { date: "2026-09-16", openTime: "10:00", closeTime: "16:00" },
    });
    await prisma.timeBlock.create({
      data: { startAt, endAt: new Date("2026-09-14T07:30:00.000Z") },
    });
    await prisma.appointment.create({
      data: {
        customerName: "Reset test",
        customerPhone: "0500000000",
        serviceId: service.id,
        startAt,
        endAt: new Date("2026-09-14T07:30:00.000Z"),
      },
    });

    await resetTestDb();

    await expect(
      Promise.all([
        prisma.appointment.count(),
        prisma.portfolioImage.count(),
        prisma.timeBlock.count(),
        prisma.closedDate.count(),
        prisma.hoursOverride.count(),
        prisma.workingHours.count(),
        prisma.service.count(),
        prisma.settings.count(),
      ]),
    ).resolves.toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
