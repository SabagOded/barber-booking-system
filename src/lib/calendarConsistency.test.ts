import type { Prisma } from "@prisma/client";
import { addMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelAdminAppointment, rescheduleAdminAppointment } from "./adminDay";
import { createAppointment, SlotUnavailableError } from "./booking";
import { prisma } from "./prisma";
import { prepareTestDb, resetTestDb } from "@/test/resetTestDb";

const hooks = vi.hoisted(() => ({
  beforeTransaction: null as null | (() => void),
  afterLock: null as null | (() => void | Promise<void>),
  forceZeroUpdate: false,
  lastUpdateCount: null as null | number,
}));

vi.mock("./prisma", async (importOriginal) => {
  const { prisma: real } = await importOriginal<typeof import("./prisma")>();
  const wrapTransaction = (tx: Prisma.TransactionClient) => new Proxy(tx, {
    get(target, key) {
      if (key === "$executeRaw") return async (...args: unknown[]) => {
        const result = await Reflect.apply(target.$executeRaw, target, args);
        const hook = hooks.afterLock;
        hooks.afterLock = null;
        await hook?.();
        return result;
      };
      if (key === "appointment") return new Proxy(target.appointment, {
        get(appointments, method) {
          if (method === "updateMany") return async (...args: unknown[]) => {
            const result = hooks.forceZeroUpdate
              ? { count: 0 }
              : await Reflect.apply(appointments.updateMany, appointments, args);
            hooks.lastUpdateCount = result.count;
            return result;
          };
          return Reflect.get(appointments, method);
        },
      });
      return Reflect.get(target, key);
    },
  });
  return {
    prisma: new Proxy(real, {
      get(target, key) {
        if (key !== "$transaction") return Reflect.get(target, key);
        return (...args: unknown[]) => {
          if (typeof args[0] !== "function") return Reflect.apply(target.$transaction, target, args);
          const hook = hooks.beforeTransaction;
          hooks.beforeTransaction = null;
          hook?.();
          const callback = args[0] as (tx: Prisma.TransactionClient) => Promise<unknown>;
          return Reflect.apply(target.$transaction, target, [
            (tx: Prisma.TransactionClient) => callback(wrapTransaction(tx)), args[1],
          ]);
        };
      },
    }),
  };
});

const TZ = "Asia/Jerusalem";
const MONDAY = "2026-09-14";
const at = (date: string, time: string) => fromZonedTime(`${date}T${time}:00`, TZ);

async function seed() {
  await prisma.settings.create({
    data: {
      id: 1, businessName: "Shop", providerName: "Barber", phone: "0500000000",
      whatsappPhone: "972500000000", timezone: TZ, slotIntervalMinutes: 30,
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

async function appointment(serviceId: string, time = "10:00") {
  const startAt = at(MONDAY, time);
  return prisma.appointment.create({
    data: {
      serviceId, startAt, endAt: addMinutes(startAt, 30),
      customerName: "דוד כהן", customerPhone: "0501234567", status: "scheduled",
    },
  });
}

describe("serialized calendar mutations", () => {
  beforeAll(prepareTestDb);
  beforeEach(resetTestDb);
  afterEach(async () => {
    vi.useRealTimers();
    hooks.beforeTransaction = null;
    hooks.afterLock = null;
    hooks.forceZeroUpdate = false;
    hooks.lastUpdateCount = null;
    await resetTestDb();
  });
  afterAll(async () => prisma.$disconnect());

  it("rejects booking if its start passes while the transaction waits for the lock", async () => {
    const service = await seed();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at(MONDAY, "09:59"));
    hooks.afterLock = () => { vi.setSystemTime(at(MONDAY, "10:01")); };

    await expect(createAppointment({
      serviceId: service.id, startAt: at(MONDAY, "10:00"),
      customerName: "דוד כהן", customerPhone: "0501234567",
    })).rejects.toBeInstanceOf(SlotUnavailableError);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("rejects rescheduling if the destination passes while the transaction waits for the lock", async () => {
    const service = await seed();
    const row = await appointment(service.id, "12:00");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at(MONDAY, "09:59"));
    hooks.afterLock = () => { vi.setSystemTime(at(MONDAY, "10:01")); };

    expect(await rescheduleAdminAppointment({ id: row.id, startAt: at(MONDAY, "10:00") }))
      .toEqual({ ok: false, code: "slot_unavailable" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: row.id } })).startAt)
      .toEqual(row.startAt);
  });

  it("refreshes the clock on a booking retry", async () => {
    const service = await seed();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at(MONDAY, "09:59"));
    let attempts = 0;
    hooks.beforeTransaction = () => {
      attempts += 1;
      hooks.afterLock = () => { vi.setSystemTime(at(MONDAY, "10:01")); };
      throw new Error("database is locked");
    };

    await expect(createAppointment({
      serviceId: service.id, startAt: at(MONDAY, "10:00"),
      customerName: "דוד כהן", customerPhone: "0501234567",
    })).rejects.toBeInstanceOf(SlotUnavailableError);
    expect(attempts).toBe(1);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("holds the calendar lock against a concurrent reschedule while cancelling", async () => {
    const service = await seed();
    const row = await appointment(service.id);
    const now = at(MONDAY, "08:00");
    let signalLocked!: () => void;
    let releaseLock!: () => void;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const released = new Promise<void>((resolve) => { releaseLock = resolve; });
    hooks.afterLock = async () => { signalLocked(); await released; };

    const cancelling = cancelAdminAppointment({ id: row.id, now });
    await locked;
    const moving = rescheduleAdminAppointment({ id: row.id, startAt: at(MONDAY, "11:00"), now });
    releaseLock();

    expect(await cancelling).toEqual({ ok: true });
    expect(await moving).toEqual({ ok: false, code: "not_scheduled" });
    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.startAt).toEqual(row.startAt);
    expect(stored.status).toBe("cancelled");
  });

  it("does not report cancellation success if its conditional write updates no row", async () => {
    const service = await seed();
    const row = await appointment(service.id);
    hooks.forceZeroUpdate = true;

    expect(await cancelAdminAppointment({ id: row.id, now: at(MONDAY, "08:00") }))
      .toEqual({ ok: false, code: "not_scheduled" });
    expect(hooks.lastUpdateCount).toBe(0);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: row.id } })).status)
      .toBe("scheduled");
  });

  it("does not claim success for a completed appointment", async () => {
    const service = await seed();
    const row = await appointment(service.id);
    await prisma.appointment.update({ where: { id: row.id }, data: { status: "completed" } });
    expect(await cancelAdminAppointment({ id: row.id, now: at(MONDAY, "08:00") }))
      .toEqual({ ok: false, code: "not_scheduled" });
  });
});
