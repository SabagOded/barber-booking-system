import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  cancelAdminAppointment,
  cancelAdminAppointmentAuthed,
  createAdminTimeBlock,
  createAdminTimeBlockAuthed,
  createAdminWalkIn,
  createAdminWalkInAuthed,
  deleteAdminTimeBlock,
  getAdminDay,
  getAdminDayAuthed,
} from "./adminDay";
import { createSession, type SessionCookieStore } from "./adminSession";
import { getAvailableSlots } from "./availability";
import { createAppointment, SlotUnavailableError } from "./booking";
import { prisma } from "./prisma";
import { prepareTestDb, resetTestDb } from "@/test/resetTestDb";
import { DEMO_MAX_TIME_BLOCKS } from "./demoMode";

const TZ = "Asia/Jerusalem";
const MONDAY = "2026-09-14";
const TUESDAY = "2026-09-15";

function jerusalem(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, TZ);
}

function memoryCookies(): SessionCookieStore {
  const map = new Map<string, string>();
  return {
    get(name) {
      const value = map.get(name);
      return value === undefined ? undefined : { value };
    },
    set(name, value) {
      map.set(name, value);
    },
    delete(name) {
      map.delete(name);
    },
  };
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
      name: "שירות",
      durationMinutes: 30,
      priceAgorot: 8000,
      sortOrder: 1,
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

  return { service };
}

describe("admin day desk", () => {
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

  it("today in Jerusalem returns only that day's scheduled rows", async () => {
    const { service } = await seedBase();
    const mondayStart = jerusalem(MONDAY, "10:00");
    const tuesdayStart = jerusalem(TUESDAY, "11:00");

    await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt: mondayStart,
        endAt: addMinutes(mondayStart, 30),
        status: "scheduled",
      },
    });
    await prisma.appointment.create({
      data: {
        customerName: "רות לוי",
        customerPhone: "0507654321",
        serviceId: service.id,
        startAt: tuesdayStart,
        endAt: addMinutes(tuesdayStart, 30),
        status: "scheduled",
      },
    });

    const now = jerusalem(MONDAY, "08:00");
    const day = await getAdminDay({ now });

    expect(day.date).toBe(MONDAY);
    expect(day.appointments).toHaveLength(1);
    expect(day.appointments[0]?.customerName).toBe("דוד כהן");
    expect(day.appointments[0]?.startLabel).toBe("10:00");
    expect(day.appointments.map((row) => row.customerName)).not.toContain("רות לוי");
  });

  it("an appointment on another day does not appear", async () => {
    const { service } = await seedBase();
    const otherStart = jerusalem(TUESDAY, "10:00");
    await prisma.appointment.create({
      data: {
        customerName: "רות לוי",
        customerPhone: "0507654321",
        serviceId: service.id,
        startAt: otherStart,
        endAt: addMinutes(otherStart, 30),
        status: "scheduled",
      },
    });

    const day = await getAdminDay({ date: MONDAY, now: jerusalem(MONDAY, "08:00") });
    expect(day.appointments).toHaveLength(0);
    expect(day.blocks).toHaveLength(0);
  });

  it("cancelled row is marked cancelled and stays in storage", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "10:00");
    const created = await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt,
        endAt: addMinutes(startAt, 30),
        status: "scheduled",
      },
    });

    const cancelledAt = jerusalem(MONDAY, "08:30");
    const result = await cancelAdminAppointment({ id: created.id, now: cancelledAt });
    expect(result).toEqual({ ok: true });

    const stored = await prisma.appointment.findUnique({ where: { id: created.id } });
    expect(stored?.status).toBe("cancelled");
    expect(stored?.cancelledAt?.getTime()).toBe(cancelledAt.getTime());

    const day = await getAdminDay({ date: MONDAY });
    expect(day.appointments).toHaveLength(1);
    expect(day.appointments[0]?.status).toBe("cancelled");
    expect(day.appointments[0]?.customerName).toBe("דוד כהן");
    expect(await prisma.appointment.count()).toBe(1);

    const again = await cancelAdminAppointment({ id: created.id, now: jerusalem(MONDAY, "09:00") });
    expect(again).toEqual({ ok: true, alreadyCancelled: true });
    const afterSecond = await prisma.appointment.findUnique({ where: { id: created.id } });
    expect(afterSecond?.cancelledAt?.getTime()).toBe(cancelledAt.getTime());
  });

  it("after cancel, getAvailableSlots includes that start again", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "10:00");
    const created = await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt,
        endAt: addMinutes(startAt, 30),
        status: "scheduled",
      },
    });

    const now = jerusalem(MONDAY, "08:00");
    const taken = await getAvailableSlots({ serviceId: service.id, date: MONDAY, now });
    expect(taken.map((slot) => formatInTimeZone(slot.startAt, TZ, "HH:mm"))).not.toContain("10:00");

    await cancelAdminAppointment({ id: created.id, now });
    const free = await getAvailableSlots({ serviceId: service.id, date: MONDAY, now });
    expect(free.map((slot) => formatInTimeZone(slot.startAt, TZ, "HH:mm"))).toContain("10:00");
  });

  it("cancel of unknown id fails cleanly", async () => {
    await seedBase();
    const result = await cancelAdminAppointment({ id: "missing-appointment" });
    expect(result).toEqual({ ok: false, code: "not_found" });
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("refuses list and cancel when the session cookie is missing", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "10:00");
    const created = await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt,
        endAt: addMinutes(startAt, 30),
        status: "scheduled",
      },
    });

    const listed = await getAdminDayAuthed(memoryCookies(), MONDAY);
    expect(listed).toEqual({ ok: false, code: "unauthenticated" });

    const cancelled = await cancelAdminAppointmentAuthed(memoryCookies(), created.id);
    expect(cancelled).toEqual({ ok: false, code: "unauthenticated" });
    const stored = await prisma.appointment.findUnique({ where: { id: created.id } });
    expect(stored?.status).toBe("scheduled");
  });

  it("lets a valid session load the day and cancel", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "17:00");
    const created = await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt,
        endAt: addMinutes(startAt, 30),
        status: "scheduled",
      },
    });

    const store = memoryCookies();
    await createSession(store);

    const listed = await getAdminDayAuthed(store, MONDAY);
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.day.appointments).toHaveLength(1);
    }

    const cancelled = await cancelAdminAppointmentAuthed(store, created.id, jerusalem(MONDAY, "08:00"));
    expect(cancelled.ok).toBe(true);
    const stored = await prisma.appointment.findUnique({ where: { id: created.id } });
    expect(stored?.status).toBe("cancelled");
  });

  it("builds a shop-interval hour grid: free, booked, blocked, and past", async () => {
    const { service } = await seedBase();
    await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
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
        reason: "הפסקה",
      },
    });

    const morning = await getAdminDay({ date: MONDAY, now: jerusalem(MONDAY, "08:00") });
    const byTime = Object.fromEntries(morning.slots.map((slot) => [slot.startLabel, slot]));
    expect(byTime["09:00"]?.kind).toBe("free");
    expect(byTime["10:00"]?.kind).toBe("booked");
    expect(byTime["13:00"]?.kind).toBe("blocked");
    expect(byTime["13:30"]?.kind).toBe("blocked");
    expect(byTime["14:00"]?.kind).toBe("free");
    expect(byTime["18:30"]?.kind).toBe("free");
    expect(byTime["19:00"]).toBeUndefined();

    const midday = await getAdminDay({ date: MONDAY, now: jerusalem(MONDAY, "12:00") });
    const middayByTime = Object.fromEntries(midday.slots.map((slot) => [slot.startLabel, slot]));
    expect(middayByTime["09:00"]?.kind).toBe("past");
    expect(middayByTime["10:00"]?.kind).toBe("booked");
    expect(middayByTime["10:00"]?.past).toBe(true);
    expect(middayByTime["12:30"]?.kind).toBe("free");
  });

  it("derives hours and the shop grid from one compact admin-day read phase", async () => {
    const { service } = await seedBase();
    await prisma.hoursOverride.create({
      data: { date: MONDAY, openTime: "10:00", closeTime: "11:00" },
    });
    await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt: jerusalem(MONDAY, "10:00"),
        endAt: jerusalem(MONDAY, "10:30"),
        status: "scheduled",
      },
    });
    await prisma.timeBlock.create({
      data: {
        startAt: jerusalem(MONDAY, "10:30"),
        endAt: jerusalem(MONDAY, "11:00"),
        reason: "הפסקה",
      },
    });

    const day = await getAdminDay({ date: MONDAY, now: jerusalem(MONDAY, "08:00") });
    const byTime = Object.fromEntries(day.slots.map((slot) => [slot.startLabel, slot]));

    expect(day.hours).toEqual({ isOpen: true, openTime: "10:00", closeTime: "11:00" });
    expect(day.services).toEqual([
      { id: service.id, name: service.name, durationMinutes: service.durationMinutes },
    ]);
    expect(byTime["09:30"]).toBeUndefined();
    expect(byTime["10:00"]?.kind).toBe("booked");
    expect(byTime["10:30"]?.kind).toBe("blocked");
  });

  it("cancelled appointments leave the grid slot free", async () => {
    const { service } = await seedBase();
    await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt: jerusalem(MONDAY, "10:00"),
        endAt: jerusalem(MONDAY, "10:30"),
        status: "cancelled",
        cancelledAt: jerusalem(MONDAY, "07:00"),
      },
    });

    const day = await getAdminDay({ date: MONDAY, now: jerusalem(MONDAY, "08:00") });
    const slot = day.slots.find((row) => row.startLabel === "10:00");
    expect(slot?.kind).toBe("free");
  });

  it("cancel of a past scheduled row is rejected and does not change status", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "10:00");
    const created = await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt,
        endAt: addMinutes(startAt, 30),
        status: "scheduled",
      },
    });

    const result = await cancelAdminAppointment({
      id: created.id,
      now: jerusalem(TUESDAY, "08:00"),
    });
    expect(result).toEqual({ ok: false, code: "past" });
    const stored = await prisma.appointment.findUnique({ where: { id: created.id } });
    expect(stored?.status).toBe("scheduled");
    expect(stored?.cancelledAt).toBeNull();

    const laterSlots = await getAvailableSlots({
      serviceId: service.id,
      date: MONDAY,
      now: jerusalem(TUESDAY, "08:00"),
    });
    expect(laterSlots.map((slot) => formatInTimeZone(slot.startAt, TZ, "HH:mm"))).not.toContain(
      "10:00",
    );
  });

  it("walk-in via createAppointment writes scheduled and occupies the start", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "10:00");
    const now = jerusalem(MONDAY, "08:00");
    const result = await createAdminWalkIn({
      serviceId: service.id,
      startAt,
      customerName: "דוד כהן",
      customerPhone: "0501234567",
      now,
    });
    expect(result.ok).toBe(true);

    const stored = await prisma.appointment.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe("scheduled");

    const day = await getAdminDay({ date: MONDAY, now });
    expect(day.slots.find((slot) => slot.startLabel === "10:00")?.kind).toBe("booked");
  });

  it("requires confirmation before creating a walk-in without a phone", async () => {
    const { service } = await seedBase();
    const input = {
      serviceId: service.id,
      startAt: jerusalem(MONDAY, "10:00"),
      customerName: "דוד כהן",
      customerPhone: "",
      now: jerusalem(MONDAY, "08:00"),
    };

    expect(await createAdminWalkIn(input)).toEqual({
      ok: false,
      code: "phone_confirmation_required",
    });
    expect(await prisma.appointment.count()).toBe(0);

    const confirmed = await createAdminWalkIn({
      ...input,
      confirmedWithoutPhone: true,
    });
    expect(confirmed.ok).toBe(true);
    const stored = await prisma.appointment.findFirstOrThrow();
    expect(stored.customerPhone).toBeNull();

    const day = await getAdminDay({ date: MONDAY, now: input.now });
    expect(day.appointments).toContainEqual(expect.objectContaining({
      id: stored.id,
      customerPhone: null,
    }));
  });

  it("creates a confirmed phone-less walk-in through the authenticated boundary", async () => {
    const { service } = await seedBase();
    const store = memoryCookies();
    await createSession(store);
    const input = {
      serviceId: service.id,
      startAt: jerusalem(MONDAY, "10:00"),
      customerName: "דוד כהן",
      customerPhone: null,
      now: jerusalem(MONDAY, "08:00"),
    };

    expect(await createAdminWalkInAuthed(store, input)).toEqual({
      ok: false,
      code: "phone_confirmation_required",
    });
    expect(await prisma.appointment.count()).toBe(0);

    const result = await createAdminWalkInAuthed(store, {
      ...input,
      confirmedWithoutPhone: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await prisma.appointment.findUnique({ where: { id: result.id } })).toMatchObject({
      customerName: "דוד כהן",
      customerPhone: null,
      status: "scheduled",
    });
  });

  it("still rejects an invalid phone for a manual appointment", async () => {
    const { service } = await seedBase();
    expect(await createAdminWalkIn({
      serviceId: service.id,
      startAt: jerusalem(MONDAY, "10:00"),
      customerName: "דוד כהן",
      customerPhone: "123",
      now: jerusalem(MONDAY, "08:00"),
    })).toEqual({ ok: false, code: "validation_phone" });
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("overlapping second walk-in is slot_unavailable", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "10:00");
    const now = jerusalem(MONDAY, "08:00");
    const first = await createAdminWalkIn({
      serviceId: service.id,
      startAt,
      customerName: "דוד כהן",
      customerPhone: "0501234567",
      now,
    });
    expect(first.ok).toBe(true);

    const second = await createAdminWalkIn({
      serviceId: service.id,
      startAt,
      customerName: "רות לוי",
      customerPhone: "0507654321",
      now,
    });
    expect(second).toEqual({ ok: false, code: "slot_unavailable" });
    expect(await prisma.appointment.count()).toBe(1);
  });

  it("block covering a free span hides those starts from getAvailableSlots", async () => {
    const { service } = await seedBase();
    const now = jerusalem(MONDAY, "08:00");
    const blocked = await createAdminTimeBlock({
      startAt: jerusalem(MONDAY, "13:00"),
      endAt: jerusalem(MONDAY, "14:00"),
      reason: "הפסקה",
    });
    expect(blocked.ok).toBe(true);

    const slots = await getAvailableSlots({ serviceId: service.id, date: MONDAY, now });
    const times = slots.map((slot) => formatInTimeZone(slot.startAt, TZ, "HH:mm"));
    expect(times).not.toContain("13:00");
    expect(times).not.toContain("13:30");
    expect(times).toContain("12:30");
    expect(times).toContain("14:00");

    const day = await getAdminDay({ date: MONDAY, now });
    expect(day.slots.find((slot) => slot.startLabel === "13:00")?.kind).toBe("blocked");
    expect(day.slots.find((slot) => slot.startLabel === "13:30")?.kind).toBe("blocked");
  });

  it("block that overlaps a scheduled row is rejected", async () => {
    const { service } = await seedBase();
    const now = jerusalem(MONDAY, "08:00");
    const walkIn = await createAdminWalkIn({
      serviceId: service.id,
      startAt: jerusalem(MONDAY, "10:00"),
      customerName: "דוד כהן",
      customerPhone: "0501234567",
      now,
    });

    expect(walkIn.ok).toBe(true);

    const blocked = await createAdminTimeBlock({
      startAt: jerusalem(MONDAY, "09:30"),
      endAt: jerusalem(MONDAY, "10:30"),
    });
    expect(blocked).toEqual({ ok: false, code: "overlap" });
    expect(await prisma.timeBlock.count()).toBe(0);
    const stored = await prisma.appointment.findFirst();
    expect(stored?.status).toBe("scheduled");
  });

  it("rejects a block that overlaps an existing block", async () => {
    await seedBase();
    const first = await createAdminTimeBlock({
      startAt: jerusalem(MONDAY, "13:00"),
      endAt: jerusalem(MONDAY, "14:00"),
    });
    expect(first.ok).toBe(true);

    const overlapping = await createAdminTimeBlock({
      startAt: jerusalem(MONDAY, "13:30"),
      endAt: jerusalem(MONDAY, "14:30"),
    });
    expect(overlapping).toEqual({ ok: false, code: "overlap" });
    expect(await prisma.timeBlock.count()).toBe(1);
  });

  it("does not delete a past block", async () => {
    await seedBase();
    const block = await prisma.timeBlock.create({
      data: {
        startAt: jerusalem(MONDAY, "10:00"),
        endAt: jerusalem(MONDAY, "11:00"),
      },
    });

    const result = await deleteAdminTimeBlock(block.id, jerusalem(MONDAY, "10:00"));
    expect(result).toEqual({ ok: false, code: "past" });
    expect(await prisma.timeBlock.count()).toBe(1);
  });

  it("trims only the future portion of an active block", async () => {
    await seedBase();
    const block = await prisma.timeBlock.create({
      data: {
        startAt: jerusalem(MONDAY, "13:00"),
        endAt: jerusalem(MONDAY, "14:00"),
      },
    });

    const result = await deleteAdminTimeBlock(
      block.id,
      jerusalem(MONDAY, "13:25"),
      jerusalem(MONDAY, "13:30"),
    );
    expect(result).toEqual({ ok: true });
    const stored = await prisma.timeBlock.findUnique({ where: { id: block.id } });
    expect(stored?.startAt).toEqual(jerusalem(MONDAY, "13:00"));
    expect(stored?.endAt).toEqual(jerusalem(MONDAY, "13:30"));
  });

  it("does not reopen the past portion of an active block", async () => {
    await seedBase();
    const block = await prisma.timeBlock.create({
      data: {
        startAt: jerusalem(MONDAY, "13:00"),
        endAt: jerusalem(MONDAY, "14:00"),
      },
    });

    const result = await deleteAdminTimeBlock(
      block.id,
      jerusalem(MONDAY, "13:25"),
      jerusalem(MONDAY, "13:00"),
    );
    expect(result).toEqual({ ok: false, code: "past" });
    const stored = await prisma.timeBlock.findUnique({ where: { id: block.id } });
    expect(stored?.endAt).toEqual(jerusalem(MONDAY, "14:00"));
  });

  it("rejects a stale partial removal after another removal opens a booked interval", async () => {
    const { service } = await seedBase();
    const now = jerusalem(MONDAY, "08:00");
    const block = await prisma.timeBlock.create({
      data: {
        startAt: jerusalem(MONDAY, "13:00"),
        endAt: jerusalem(MONDAY, "14:00"),
      },
    });

    let release!: () => void;
    let ready!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const staged = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const concurrentChange = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`UPDATE "Settings" SET "businessName" = "businessName" WHERE "id" = 1`;
        ready();
        await held;
        await tx.timeBlock.update({
          where: { id: block.id },
          data: { endAt: jerusalem(MONDAY, "13:30") },
        });
        await tx.appointment.create({
          data: {
            serviceId: service.id,
            customerName: "דוד כהן",
            customerPhone: "0501234567",
            startAt: jerusalem(MONDAY, "13:30"),
            endAt: jerusalem(MONDAY, "14:00"),
            status: "scheduled",
          },
        });
      },
      { timeout: 10_000 },
    );

    await staged;
    const staleRemoval = deleteAdminTimeBlock(block.id, now, jerusalem(MONDAY, "13:45"));
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      release();
    }
    await concurrentChange;
    expect(await staleRemoval).toEqual({
      ok: false,
      code: "invalid_range",
    });

    const stored = await prisma.timeBlock.findUnique({ where: { id: block.id } });
    const booking = await prisma.appointment.findFirst({ where: { status: "scheduled" } });
    expect(stored?.endAt).toEqual(booking?.startAt);
    expect(stored && booking ? stored.endAt.getTime() <= booking.startAt.getTime() : false).toBe(true);
  });

  it("cancelled appointments do not block a time range", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "10:00");
    await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt,
        endAt: addMinutes(startAt, 30),
        status: "cancelled",
        cancelledAt: jerusalem(MONDAY, "07:00"),
      },
    });

    const blocked = await createAdminTimeBlock({
      startAt,
      endAt: jerusalem(MONDAY, "10:30"),
    });
    expect(blocked.ok).toBe(true);
  });

  it("serializes a block against a concurrent customer booking", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "13:00");
    const now = jerusalem(MONDAY, "08:00");
    const [block, booking] = await Promise.all([
      createAdminTimeBlock({
        startAt,
        endAt: addMinutes(startAt, 30),
      }),
      createAppointment({
        serviceId: service.id,
        startAt,
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        now,
      }).then(
        () => ({ ok: true as const }),
        (error: unknown) => {
          if (!(error instanceof SlotUnavailableError)) {
            throw error;
          }
          return { ok: false as const };
        },
      ),
    ]);

    expect([block.ok, booking.ok].filter(Boolean)).toHaveLength(1);
    expect(await prisma.appointment.count({ where: { status: "scheduled" } })).toBe(
      booking.ok ? 1 : 0,
    );
    expect(await prisma.timeBlock.count()).toBe(block.ok ? 1 : 0);
    const [storedBlock, storedBooking] = await Promise.all([
      prisma.timeBlock.findFirst(),
      prisma.appointment.findFirst({ where: { status: "scheduled" } }),
    ]);
    expect(
      storedBlock && storedBooking
        ? storedBlock.startAt < storedBooking.endAt && storedBlock.endAt > storedBooking.startAt
        : false,
    ).toBe(false);
  });

  it("delete block restores availability", async () => {
    const { service } = await seedBase();
    const now = jerusalem(MONDAY, "08:00");
    const blocked = await createAdminTimeBlock({
      startAt: jerusalem(MONDAY, "13:00"),
      endAt: jerusalem(MONDAY, "14:00"),
    });
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) {
      return;
    }

    const removed = await deleteAdminTimeBlock(blocked.id, now);
    expect(removed).toEqual({ ok: true });

    const slots = await getAvailableSlots({ serviceId: service.id, date: MONDAY, now });
    const times = slots.map((slot) => formatInTimeZone(slot.startAt, TZ, "HH:mm"));
    expect(times).toContain("13:00");
    expect(times).toContain("13:30");
  });

  it("cancel of a future walk-in frees the slot", async () => {
    const { service } = await seedBase();
    const startAt = jerusalem(MONDAY, "17:00");
    const now = jerusalem(MONDAY, "08:00");
    const walkIn = await createAdminWalkIn({
      serviceId: service.id,
      startAt,
      customerName: "דוד כהן",
      customerPhone: "0501234567",
      now,
    });
    expect(walkIn.ok).toBe(true);
    if (!walkIn.ok) {
      return;
    }

    const cancelled = await cancelAdminAppointment({ id: walkIn.id, now });
    expect(cancelled.ok).toBe(true);
    const slots = await getAvailableSlots({ serviceId: service.id, date: MONDAY, now });
    expect(slots.map((slot) => formatInTimeZone(slot.startAt, TZ, "HH:mm"))).toContain("17:00");
  });

  it("refuses walk-in and block writes without a session", async () => {
    const { service } = await seedBase();
    const empty = memoryCookies();
    const walkIn = await createAdminWalkInAuthed(empty, {
      serviceId: service.id,
      startAt: jerusalem(MONDAY, "10:00"),
      customerName: "דוד כהן",
      customerPhone: "0501234567",
      now: jerusalem(MONDAY, "08:00"),
    });
    expect(walkIn).toEqual({ ok: false, code: "unauthenticated" });

    const blocked = await createAdminTimeBlockAuthed(empty, {
      startAt: jerusalem(MONDAY, "13:00"),
      endAt: jerusalem(MONDAY, "14:00"),
    });
    expect(blocked).toEqual({ ok: false, code: "unauthenticated" });
    expect(await prisma.appointment.count()).toBe(0);
    expect(await prisma.timeBlock.count()).toBe(0);
  });
  it("blocks new time blocks after the demo limit is reached", async () => {
    await seedBase();

    const previousDemoMode = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "true";

    try {
      await prisma.timeBlock.createMany({
        data: Array.from({ length: DEMO_MAX_TIME_BLOCKS }, (_, index) => {
          const startAt = jerusalem(
            MONDAY,
            `${String(9 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}`,
          );

          return {
            startAt,
            endAt: addMinutes(startAt, 30),
            reason: "Demo block",
          };
        }),
      });

      const result = await createAdminTimeBlock({
        startAt: jerusalem(MONDAY, "14:00"),
        endAt: jerusalem(MONDAY, "14:30"),
      });

      expect(result).toEqual({ ok: false, code: "demo_limit" });
      expect(await prisma.timeBlock.count()).toBe(DEMO_MAX_TIME_BLOCKS);
    } finally {
      if (previousDemoMode === undefined) {
        delete process.env.DEMO_MODE;
      } else {
        process.env.DEMO_MODE = previousDemoMode;
      }
    }
  });
});
