import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import {
  BookingValidationError,
  createAppointment,
  InvalidSlotError,
  ServiceNotBookableError,
  SlotUnavailableError,
} from "./booking";
import { prisma } from "./prisma";
import { MAX_CUSTOMER_NAME_LENGTH } from "./customerFields";
import { prepareTestDb, resetTestDb } from "@/test/resetTestDb";
import {
  DEMO_MAX_APPOINTMENTS,
  DemoLimitError,
} from "./demoMode";

const TZ = "Asia/Jerusalem";
const MONDAY = "2026-09-14";
const SATURDAY = "2026-09-19";

function jerusalem(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, TZ);
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
    data: {
      name: "שירות רגיל",
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

  return { service, extendedService };
}

describe("createAppointment", () => {
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

  it("creates a scheduled appointment with the correct endAt", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "10:00");

    const appointment = await createAppointment({
      serviceId: service.id,
      startAt,
      customerName: "  דוד   כהן  ",
      customerPhone: "+972 50-123-4567",
      now: jerusalem(MONDAY, "08:00"),
    });

    expect(appointment.status).toBe("scheduled");
    expect(appointment.customerName).toBe("דוד כהן");
    expect(appointment.customerPhone).toBe("0501234567");
    expect(appointment.startAt.getTime()).toBe(startAt.getTime());
    expect(appointment.endAt.getTime()).toBe(addMinutes(startAt, 30).getTime());
  });

  it("rejects an unknown or inactive service", async () => {
    const { service } = await seedBase();
    const now = jerusalem(MONDAY, "08:00");
    const startAt = jerusalem(MONDAY, "10:00");

    await prisma.service.update({
      where: { id: service.id },
      data: { active: false },
    });

    await expect(
      createAppointment({
        serviceId: service.id,
        startAt,
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        now,
      }),
    ).rejects.toBeInstanceOf(ServiceNotBookableError);

    await expect(
      createAppointment({
        serviceId: "missing-service",
        startAt,
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        now,
      }),
    ).rejects.toBeInstanceOf(ServiceNotBookableError);

    expect(await prisma.appointment.count()).toBe(0);
  });

  it("rejects a bad name", async () => {
    const { service } = await seedBase();
    const input = {
      serviceId: service.id,
      startAt: jerusalem(MONDAY, "10:00"),
      customerPhone: "0501234567",
      now: jerusalem(MONDAY, "08:00"),
    };

    await expect(createAppointment({ ...input, customerName: "A" })).rejects.toBeInstanceOf(
      BookingValidationError,
    );
    await expect(createAppointment({ ...input, customerName: "  " })).rejects.toBeInstanceOf(
      BookingValidationError,
    );
    await expect(createAppointment({ ...input, customerName: "אבגד" })).rejects.toBeInstanceOf(
      BookingValidationError,
    );
    await expect(createAppointment({ ...input, customerName: "דוד" })).rejects.toBeInstanceOf(
      BookingValidationError,
    );
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("accepts the name length boundary and rejects an oversized name on the server", async () => {
    const { service } = await seedBase();
    const input = {
      serviceId: service.id,
      startAt: jerusalem(MONDAY, "10:00"),
      customerPhone: "0501234567",
      now: jerusalem(MONDAY, "08:00"),
    };
    const atLimit = `דוד ${"א".repeat(MAX_CUSTOMER_NAME_LENGTH - 4)}`;

    const appointment = await createAppointment({ ...input, customerName: atLimit });
    expect(appointment.customerName).toBe(atLimit);
    await expect(
      createAppointment({ ...input, customerName: `${atLimit}א` }),
    ).rejects.toMatchObject({ field: "name" });
    expect(await prisma.appointment.count()).toBe(1);
  });

  it("rejects a name that contains digits", async () => {
    const { service } = await seedBase();
    const input = {
      serviceId: service.id,
      startAt: jerusalem(MONDAY, "10:00"),
      customerPhone: "0501234567",
      now: jerusalem(MONDAY, "08:00"),
    };

    await expect(
      createAppointment({ ...input, customerName: "דוד2 כהן" }),
    ).rejects.toBeInstanceOf(BookingValidationError);
    await expect(
      createAppointment({ ...input, customerName: "דני 2" }),
    ).rejects.toBeInstanceOf(BookingValidationError);
    await expect(
      createAppointment({ ...input, customerName: "Israel1 Cohen" }),
    ).rejects.toBeInstanceOf(BookingValidationError);
    await expect(
      createAppointment({ ...input, customerName: "Oded 1" }),
    ).rejects.toBeInstanceOf(BookingValidationError);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("accepts extra spaces and three-word Hebrew names", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "10:00");

    const appointment = await createAppointment({
      serviceId: service.id,
      startAt,
      customerName: "רותי בן דוד",
      customerPhone: "0501234567",
      now: jerusalem(MONDAY, "08:00"),
    });

    expect(appointment.customerName).toBe("רותי בן דוד");
    expect(appointment.status).toBe("scheduled");
  });

  it("rejects a bad phone", async () => {
    const { service } = await seedBase();
    const input = {
      serviceId: service.id,
      startAt: jerusalem(MONDAY, "10:00"),
      customerName: "דוד כהן",
      now: jerusalem(MONDAY, "08:00"),
    };

    await expect(
      createAppointment({ ...input, customerPhone: "031234567" }),
    ).rejects.toBeInstanceOf(BookingValidationError);
    await expect(createAppointment({ ...input, customerPhone: "123" })).rejects.toBeInstanceOf(
      BookingValidationError,
    );
    await expect(createAppointment({ ...input, customerPhone: "abc" })).rejects.toBeInstanceOf(
      BookingValidationError,
    );
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("rejects a start that is not on the slot grid", async () => {
    const { service } = await seedBase();

    await expect(
      createAppointment({
        serviceId: service.id,
        startAt: jerusalem(MONDAY, "09:07"),
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        now: jerusalem(MONDAY, "08:00"),
      }),
    ).rejects.toBeInstanceOf(InvalidSlotError);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("rejects a start after the last day of next month", async () => {
    const { service } = await seedBase();
    const now = jerusalem("2026-09-11", "08:00");

    await expect(
      createAppointment({
        serviceId: service.id,
        startAt: jerusalem("2026-11-02", "10:00"),
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        now,
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("allows a start on the last bookable weekday of next month", async () => {
    const { service } = await seedBase();
    const now = jerusalem("2026-09-11", "08:00");
    const startAt = jerusalem("2026-10-30", "10:00");

    const appointment = await createAppointment({
      serviceId: service.id,
      startAt,
      customerName: "דוד כהן",
      customerPhone: "0501234567",
      now,
    });

    expect(appointment.status).toBe("scheduled");
    expect(appointment.startAt.getTime()).toBe(startAt.getTime());
  });

  it("rejects a past start", async () => {
    const { service } = await seedBase();

    await expect(
      createAppointment({
        serviceId: service.id,
        startAt: jerusalem(MONDAY, "10:00"),
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        now: jerusalem(MONDAY, "12:00"),
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("rejects Saturday and closed dates", async () => {
    const { service } = await seedBase();
    const now = jerusalem(MONDAY, "08:00");

    await expect(
      createAppointment({
        serviceId: service.id,
        startAt: jerusalem(SATURDAY, "10:00"),
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        now,
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);

    await prisma.closedDate.create({
      data: { date: MONDAY, reason: "Holiday" },
    });

    await expect(
      createAppointment({
        serviceId: service.id,
        startAt: jerusalem(MONDAY, "10:00"),
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        now,
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("rejects a start that does not fit before close", async () => {
    const { extendedService } = await seedBase();

    await expect(
      createAppointment({
        serviceId: extendedService.id,
        startAt: jerusalem(MONDAY, "18:30"),
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        now: jerusalem(MONDAY, "08:00"),
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("rejects overlap with an existing scheduled appointment", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "10:00");

    await prisma.appointment.create({
      data: {
        customerName: "קיים",
        customerPhone: "0501111111",
        serviceId: service.id,
        startAt,
        endAt: addMinutes(startAt, 30),
        status: "scheduled",
      },
    });

    await expect(
      createAppointment({
        serviceId: service.id,
        startAt,
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        now: jerusalem(MONDAY, "08:00"),
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
    expect(await prisma.appointment.count()).toBe(1);
  });

  it("allows the same slot if the existing appointment is cancelled", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "10:00");

    await prisma.appointment.create({
      data: {
        customerName: "בוטל",
        customerPhone: "0501111111",
        serviceId: service.id,
        startAt,
        endAt: addMinutes(startAt, 30),
        status: "cancelled",
        cancelledAt: jerusalem(MONDAY, "07:00"),
      },
    });

    const appointment = await createAppointment({
      serviceId: service.id,
      startAt,
      customerName: "דוד כהן",
      customerPhone: "0501234567",
      now: jerusalem(MONDAY, "08:00"),
    });

    expect(appointment.status).toBe("scheduled");
    expect(await prisma.appointment.count()).toBe(2);
  });

  it("lets only one of two concurrent creates for the same slot succeed", async () => {
    const { service } = await seedBase();
    const now = jerusalem(MONDAY, "08:00");
    const startAt = jerusalem(MONDAY, "11:00");

    const results = await Promise.allSettled([
      createAppointment({
        serviceId: service.id,
        startAt,
        customerName: "אלון כהן",
        customerPhone: "0501111111",
        now,
      }),
      createAppointment({
        serviceId: service.id,
        startAt,
        customerName: "נועה לוי",
        customerPhone: "0502222222",
        now,
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.status === "rejected" && rejected[0].reason).toBeInstanceOf(
      SlotUnavailableError,
    );
    expect(await prisma.appointment.count({ where: { status: "scheduled" } })).toBe(1);
  });

  it("blocks new appointments after the demo appointment limit is reached", async () => {
    const { service } = await seedBase();
    const previousDemoMode = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "true";

    try {
      await prisma.appointment.createMany({
        data: Array.from({ length: DEMO_MAX_APPOINTMENTS }, (_, index) => {
          const startAt = jerusalem(
            MONDAY,
            `${String(9 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}`,
          );

          return {
            customerName: `לקוח ${index}`,
            customerPhone: `05000000${String(index).padStart(2, "0")}`,
            serviceId: service.id,
            startAt,
            endAt: addMinutes(startAt, 30),
            status: index === 0 ? "cancelled" as const : "scheduled" as const,
          };
        }),
      });

      await expect(
        createAppointment({
          serviceId: service.id,
          startAt: jerusalem(MONDAY, "15:00"),
          customerName: "דוד כהן",
          customerPhone: "0501234567",
          now: jerusalem(MONDAY, "08:00"),
        }),
      ).rejects.toBeInstanceOf(DemoLimitError);

      expect(await prisma.appointment.count()).toBe(DEMO_MAX_APPOINTMENTS);
    } finally {
      if (previousDemoMode === undefined) {
        delete process.env.DEMO_MODE;
      } else {
        process.env.DEMO_MODE = previousDemoMode;
      }
    }
  });
});
