import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { getPublicTicketStatus, isLiveTicketStatus } from "./publicTicket";
import { prisma } from "./prisma";
import { prepareTestDb, resetTestDb } from "@/test/resetTestDb";

const TZ = "Asia/Jerusalem";

function jerusalem(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, TZ);
}

describe("getPublicTicketStatus", () => {
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

  async function seedAppointment(status: "scheduled" | "cancelled") {
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
    const startAt = jerusalem("2026-09-14", "17:00");
    return prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt,
        endAt: addMinutes(startAt, 30),
        status,
        cancelledAt: status === "cancelled" ? jerusalem("2026-09-14", "08:00") : undefined,
      },
    });
  }

  it("scheduled id is live for the landing ticket", async () => {
    const row = await seedAppointment("scheduled");
    const result = await getPublicTicketStatus({ id: row.id });
    expect(result).toEqual({
      status: "scheduled",
      startAtIso: row.startAt.toISOString(),
      endAtIso: row.endAt.toISOString(),
    });
    expect(isLiveTicketStatus(result.status)).toBe(true);
    expect(Object.keys(result)).toEqual(["status", "startAtIso", "endAtIso"]);
    expect(result).not.toHaveProperty("customerName");
    expect(result).not.toHaveProperty("customerPhone");
  });

  it("cancelled id is not live", async () => {
    const row = await seedAppointment("cancelled");
    const result = await getPublicTicketStatus({ id: row.id });
    expect(result).toEqual({ status: "cancelled" });
    expect(isLiveTicketStatus(result.status)).toBe(false);
    expect(Object.keys(result)).toEqual(["status"]);
  });

  it("unknown id is not live", async () => {
    const result = await getPublicTicketStatus({ id: "does-not-exist" });
    expect(result).toEqual({ status: "missing" });
    expect(isLiveTicketStatus(result.status)).toBe(false);
  });
});
