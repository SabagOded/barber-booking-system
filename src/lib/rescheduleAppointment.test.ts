import { addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAdminRescheduleSlots,
  rescheduleAdminAppointment,
  rescheduleAdminAppointmentAuthed,
} from "./adminDay";
import type { SessionCookieStore } from "./adminSession";
import { getAvailableSlots } from "./availability";
import { createAppointment as bookAppointment } from "./booking";
import { isUpcomingTicket, parseLastTicket, readLastTicketStorage, withCurrentTicketTime, writeLastTicketStorage } from "./lastTicket";
import { getPublicTicketStatus } from "./publicTicket";
import { prisma } from "./prisma";
import { prepareTestDb, resetTestDb } from "@/test/resetTestDb";

const TZ = "Asia/Jerusalem";
const MONDAY = "2026-09-14";
const TUESDAY = "2026-09-15";

function jerusalem(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, TZ);
}

function memoryCookies(): SessionCookieStore {
  return {
    get() {
      return undefined;
    },
    set() {},
    delete() {},
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
  return service;
}

async function createAppointment(options: {
  serviceId: string;
  startAt?: Date;
  durationMinutes?: number;
  status?: "scheduled" | "cancelled" | "completed";
}) {
  const startAt = options.startAt ?? jerusalem(MONDAY, "10:00");
  return prisma.appointment.create({
    data: {
      customerName: "דוד כהן",
      customerPhone: "0501234567",
      serviceId: options.serviceId,
      startAt,
      endAt: addMinutes(startAt, options.durationMinutes ?? 45),
      status: options.status ?? "scheduled",
      cancelledAt: options.status === "cancelled" ? jerusalem(MONDAY, "07:00") : null,
    },
  });
}

describe("admin appointment rescheduling", () => {
  beforeAll(prepareTestDb);
  beforeEach(resetTestDb);
  afterEach(resetTestDb);
  afterAll(async () => prisma.$disconnect());

  it("moves a future appointment in place while preserving its id, fields, status, and original duration", async () => {
    const service = await seedBase();
    const original = await createAppointment({ serviceId: service.id, durationMinutes: 45 });
    await prisma.service.update({ where: { id: service.id }, data: { durationMinutes: 60 } });

    const result = await rescheduleAdminAppointment({
      id: original.id,
      startAt: jerusalem(TUESDAY, "12:00"),
      now: jerusalem(MONDAY, "08:00"),
    });

    expect(result.ok).toBe(true);
    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: original.id } });
    expect(stored.id).toBe(original.id);
    expect(stored.customerName).toBe(original.customerName);
    expect(stored.customerPhone).toBe(original.customerPhone);
    expect(stored.serviceId).toBe(original.serviceId);
    expect(stored.status).toBe("scheduled");
    expect(stored.createdAt.getTime()).toBe(original.createdAt.getTime());
    expect(stored.endAt.getTime() - stored.startAt.getTime()).toBe(45 * 60_000);
    expect(await prisma.appointment.count()).toBe(1);
  });

  it("hydrates a saved customer ticket with the new time after an admin reschedules", async () => {
    const service = await seedBase();
    const original = await bookAppointment({
      serviceId: service.id,
      startAt: jerusalem(MONDAY, "10:00"),
      customerName: "דוד כהן",
      customerPhone: "0501234567",
      now: jerusalem(MONDAY, "08:00"),
    });
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
    try {
      writeLastTicketStorage({
        appointmentId: original.id,
        customerName: original.customerName,
        customerPhone: original.customerPhone,
        serviceName: service.name,
        shopName: "שם העסק",
        startAt: original.startAt.toISOString(),
        endAt: original.endAt.toISOString(),
      });
      const moved = await rescheduleAdminAppointment({
        id: original.id,
        startAt: jerusalem(TUESDAY, "12:00"),
        now: jerusalem(MONDAY, "08:00"),
      });
      expect(moved.ok).toBe(true);

      const saved = parseLastTicket(readLastTicketStorage());
      expect(saved).not.toBeNull();
      const status = await getPublicTicketStatus({ id: saved!.appointmentId! });
      expect(status.status).toBe("scheduled");
      if (status.status !== "scheduled") return;
      const current = withCurrentTicketTime(saved!, status);
      writeLastTicketStorage(current);
      const displayed = parseLastTicket(readLastTicketStorage());
      expect(displayed?.startAt).toBe(jerusalem(TUESDAY, "12:00").toISOString());
      expect(displayed?.endAt).toBe(jerusalem(TUESDAY, "12:30").toISOString());
      expect(formatInTimeZone(displayed!.startAt, TZ, "HH:mm")).toBe("12:00");
      expect(isUpcomingTicket(displayed!, jerusalem(MONDAY, "11:00"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("frees the old slot and occupies the new slot after a successful move", async () => {
    const service = await seedBase();
    const original = await createAppointment({ serviceId: service.id, durationMinutes: 30 });
    const now = jerusalem(MONDAY, "08:00");

    await rescheduleAdminAppointment({ id: original.id, startAt: jerusalem(TUESDAY, "12:00"), now });

    const oldSlots = await getAvailableSlots({ serviceId: service.id, date: MONDAY, now });
    const newSlots = await getAvailableSlots({ serviceId: service.id, date: TUESDAY, now });
    expect(oldSlots.map((slot) => formatInTimeZone(slot.startAt, TZ, "HH:mm"))).toContain("10:00");
    expect(newSlots.map((slot) => formatInTimeZone(slot.startAt, TZ, "HH:mm"))).not.toContain("12:00");
  });

  it("allows rescheduling an existing appointment after its service becomes inactive", async () => {
    const service = await seedBase();
    const original = await createAppointment({ serviceId: service.id, durationMinutes: 30 });
    const destination = jerusalem(TUESDAY, "12:00");

    await prisma.service.update({ where: { id: service.id }, data: { active: false } });

    const result = await rescheduleAdminAppointment({
      id: original.id,
      startAt: destination,
      now: jerusalem(MONDAY, "08:00"),
    });

    expect(result.ok).toBe(true);
    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: original.id } });
    expect(stored.id).toBe(original.id);
    expect(stored.startAt).toEqual(destination);
    expect(stored.endAt).toEqual(addMinutes(destination, 30));
  });

  it("rejects overlap with another scheduled appointment", async () => {
    const service = await seedBase();
    const original = await createAppointment({ serviceId: service.id });
    await createAppointment({ serviceId: service.id, startAt: jerusalem(TUESDAY, "12:30") });

    const result = await rescheduleAdminAppointment({
      id: original.id,
      startAt: jerusalem(TUESDAY, "12:00"),
      now: jerusalem(MONDAY, "08:00"),
    });

    expect(result).toEqual({ ok: false, code: "slot_unavailable" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: original.id } })).startAt).toEqual(original.startAt);
  });

  it("rejects overlap with a TimeBlock", async () => {
    const service = await seedBase();
    const original = await createAppointment({ serviceId: service.id });
    await prisma.timeBlock.create({
      data: { startAt: jerusalem(TUESDAY, "12:30"), endAt: jerusalem(TUESDAY, "13:30") },
    });

    const result = await rescheduleAdminAppointment({
      id: original.id,
      startAt: jerusalem(TUESDAY, "12:00"),
      now: jerusalem(MONDAY, "08:00"),
    });
    expect(result).toEqual({ ok: false, code: "slot_unavailable" });
  });

  it("rejects a closed date", async () => {
    const service = await seedBase();
    const original = await createAppointment({ serviceId: service.id });
    await prisma.closedDate.create({ data: { date: TUESDAY } });

    const result = await rescheduleAdminAppointment({
      id: original.id,
      startAt: jerusalem(TUESDAY, "12:00"),
      now: jerusalem(MONDAY, "08:00"),
    });
    expect(result).toEqual({ ok: false, code: "slot_unavailable" });
  });

  it("respects HoursOverride instead of weekly hours", async () => {
    const service = await seedBase();
    const original = await createAppointment({ serviceId: service.id });
    await prisma.hoursOverride.create({
      data: { date: TUESDAY, openTime: "12:00", closeTime: "13:00" },
    });

    const accepted = await rescheduleAdminAppointment({
      id: original.id,
      startAt: jerusalem(TUESDAY, "12:00"),
      now: jerusalem(MONDAY, "08:00"),
    });
    expect(accepted.ok).toBe(true);

    const rejected = await rescheduleAdminAppointment({
      id: original.id,
      startAt: jerusalem(TUESDAY, "13:00"),
      now: jerusalem(MONDAY, "08:00"),
    });
    expect(rejected).toEqual({ ok: false, code: "slot_unavailable" });
  });

  it("rejects a past appointment", async () => {
    const service = await seedBase();
    const original = await createAppointment({ serviceId: service.id });
    const result = await rescheduleAdminAppointment({
      id: original.id,
      startAt: jerusalem(TUESDAY, "12:00"),
      now: jerusalem(MONDAY, "10:00"),
    });
    expect(result).toEqual({ ok: false, code: "past" });
  });

  it("rejects a cancelled appointment", async () => {
    const service = await seedBase();
    const original = await createAppointment({ serviceId: service.id, status: "cancelled" });
    const result = await rescheduleAdminAppointment({
      id: original.id,
      startAt: jerusalem(TUESDAY, "12:00"),
      now: jerusalem(MONDAY, "08:00"),
    });
    expect(result).toEqual({ ok: false, code: "not_scheduled" });
  });

  it("excludes the current appointment from its own conflict check", async () => {
    const service = await seedBase();
    const original = await createAppointment({ serviceId: service.id });
    const now = jerusalem(MONDAY, "08:00");

    const preview = await getAdminRescheduleSlots({ id: original.id, date: MONDAY, now });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.slots.map((slot) => slot.startAtIso)).toContain(original.startAt.toISOString());
    }
    const result = await rescheduleAdminAppointment({ id: original.id, startAt: original.startAt, now });
    expect(result.ok).toBe(true);
  });

  it("rejects safely when a previewed destination becomes unavailable", async () => {
    const service = await seedBase();
    const original = await createAppointment({ serviceId: service.id });
    const now = jerusalem(MONDAY, "08:00");
    const destination = jerusalem(TUESDAY, "12:00");
    const preview = await getAdminRescheduleSlots({ id: original.id, date: TUESDAY, now });
    expect(preview.ok && preview.slots.some((slot) => slot.startAtIso === destination.toISOString())).toBe(true);

    await createAppointment({ serviceId: service.id, startAt: destination });
    const result = await rescheduleAdminAppointment({ id: original.id, startAt: destination, now });

    expect(result).toEqual({ ok: false, code: "slot_unavailable" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: original.id } })).startAt).toEqual(original.startAt);
  });

  it("enforces authentication", async () => {
    const service = await seedBase();
    const original = await createAppointment({ serviceId: service.id });
    const result = await rescheduleAdminAppointmentAuthed(memoryCookies(), {
      id: original.id,
      startAt: jerusalem(TUESDAY, "12:00"),
      now: jerusalem(MONDAY, "08:00"),
    });
    expect(result).toEqual({ ok: false, code: "unauthenticated" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: original.id } })).startAt).toEqual(original.startAt);
  });
});
