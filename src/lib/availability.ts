import { addMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { getEffectiveHours, type EffectiveHours } from "./shopHours";

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^\d{2}:\d{2}$/;

export type AvailabilityClient = PrismaClient | Prisma.TransactionClient;

export type TimeSlot = {
  startAt: Date;
  endAt: Date;
};

export type SlotStatus = "available" | "taken" | "past";

export type DaySlot = {
  startAt: Date;
  endAt: Date;
  status: SlotStatus;
};

type AvailabilitySettings = {
  timezone: string;
  slotIntervalMinutes: number;
};

type AvailabilityService = {
  active: boolean;
  durationMinutes: number;
};

type BusyRange = {
  startAt: Date;
  endAt: Date;
};

export function buildDaySlotGrid(args: {
  date: string;
  now: Date;
  settings: AvailabilitySettings;
  service: AvailabilityService;
  hours: EffectiveHours;
  appointments: BusyRange[];
  blocks: BusyRange[];
  durationMs?: number;
}): DaySlot[] {
  const { date, now, settings, service, hours } = args;
  assertCalendarDate(date);

  if (!service.active && args.durationMs === undefined) {
    return [];
  }

  const durationMs = args.durationMs ?? service.durationMinutes * 60_000;
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !hours.isOpen) {
    return [];
  }

  const openMinutes = clockToMinutes(hours.openTime);
  const closeMinutes = clockToMinutes(hours.closeTime);
  const busy = [...args.appointments, ...args.blocks];
  const slots: DaySlot[] = [];

  for (
    let startMinutes = openMinutes;
    startMinutes * 60_000 + durationMs <= closeMinutes * 60_000;
    startMinutes += settings.slotIntervalMinutes
  ) {
    const startAt = zonedClockToUtc(date, minutesToClock(startMinutes), settings.timezone);
    const endAt = new Date(startAt.getTime() + durationMs);
    let status: SlotStatus = "available";

    if (startAt.getTime() <= now.getTime()) {
      status = "past";
    } else if (busy.some((range) => overlaps(startAt, endAt, range.startAt, range.endAt))) {
      status = "taken";
    }

    slots.push({ startAt, endAt, status });
  }

  return slots;
}

export async function getAvailableSlots(
  args: {
    serviceId: string;
    date: string;
    now?: Date;
    durationMs?: number;
    excludeAppointmentId?: string;
  },
  db: AvailabilityClient = prisma,
): Promise<TimeSlot[]> {
  const grid = await getDaySlotGrid(args, db);
  return grid
    .filter((slot) => slot.status === "available")
    .map(({ startAt, endAt }) => ({ startAt, endAt }));
}

export async function getDaySlotGrid(
  args: {
    serviceId: string;
    date: string;
    now?: Date;
    durationMs?: number;
    excludeAppointmentId?: string;
  },
  db: AvailabilityClient = prisma,
): Promise<DaySlot[]> {
  const { serviceId, date, now = new Date() } = args;
  assertCalendarDate(date);

  const [settings, service] = await Promise.all([
    db.settings.findUnique({ where: { id: 1 } }),
    db.service.findUnique({ where: { id: serviceId } }),
  ]);

  if (!settings) {
    throw new Error("Settings not found");
  }
  if (!service) {
    throw new Error("Service not found");
  }
  if (!service.active && args.durationMs === undefined) {
    return [];
  }
  const durationMs = args.durationMs ?? service.durationMinutes * 60_000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return [];
  }
  const timeZone = settings.timezone;
  const hours = await getEffectiveHours(date, db);
  if (!hours.isOpen) {
    return [];
  }

  const dayStart = zonedClockToUtc(date, "00:00", timeZone);
  const dayEnd = zonedClockToUtc(addCalendarDay(date), "00:00", timeZone);

  const [appointments, blocks] = await Promise.all([
    db.appointment.findMany({
      where: {
        status: "scheduled",
        ...(args.excludeAppointmentId ? { id: { not: args.excludeAppointmentId } } : {}),
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { startAt: true, endAt: true },
    }),
    db.timeBlock.findMany({
      where: {
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  return buildDaySlotGrid({
    date,
    now,
    settings,
    service,
    hours,
    appointments,
    blocks,
    durationMs,
  });
}

export type ShopSlotKind = "free" | "past" | "booked" | "blocked";

export type ShopDaySlot = {
  startAt: Date;
  endAt: Date;
  kind: ShopSlotKind;
  appointmentId?: string;
  blockId?: string;
  reason?: string | null;
};

type ShopAppointmentRange = BusyRange & { id: string };
type ShopBlockRange = BusyRange & { id: string; reason: string | null };

export function buildShopDaySlots(args: {
  date: string;
  now: Date;
  timeZone: string;
  slotIntervalMinutes: number;
  hours: EffectiveHours;
  appointments: ShopAppointmentRange[];
  blocks: ShopBlockRange[];
}): ShopDaySlot[] {
  const { date, now, timeZone, slotIntervalMinutes, hours, appointments, blocks } = args;
  assertCalendarDate(date);

  if (!hours.isOpen) {
    return [...appointments]
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .map((row) => ({
        startAt: row.startAt,
        endAt: row.endAt,
        kind: "booked" as const,
        appointmentId: row.id,
      }));
  }

  const openMinutes = clockToMinutes(hours.openTime);
  const closeMinutes = clockToMinutes(hours.closeTime);
  const slots: ShopDaySlot[] = [];

  for (
    let startMinutes = openMinutes;
    startMinutes + slotIntervalMinutes <= closeMinutes;
    startMinutes += slotIntervalMinutes
  ) {
    const startAt = zonedClockToUtc(date, minutesToClock(startMinutes), timeZone);
    const endAt = addMinutes(startAt, slotIntervalMinutes);
    const appointment = appointments.find((row) =>
      overlaps(startAt, endAt, row.startAt, row.endAt),
    );
    const block = blocks.find((row) => overlaps(startAt, endAt, row.startAt, row.endAt));

    if (appointment) {
      slots.push({ startAt, endAt, kind: "booked", appointmentId: appointment.id });
    } else if (block) {
      slots.push({
        startAt,
        endAt,
        kind: "blocked",
        blockId: block.id,
        reason: block.reason,
      });
    } else if (startAt.getTime() <= now.getTime()) {
      slots.push({ startAt, endAt, kind: "past" });
    } else {
      slots.push({ startAt, endAt, kind: "free" });
    }
  }

  for (const row of appointments) {
    if (slots.some((slot) => slot.appointmentId === row.id)) {
      continue;
    }
    slots.push({
      startAt: row.startAt,
      endAt: row.endAt,
      kind: "booked",
      appointmentId: row.id,
    });
  }
  slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  return slots;
}

/** Service-agnostic shop clock: working hours stepped by slotIntervalMinutes. */
export async function getShopDaySlots(
  args: {
    date: string;
    now?: Date;
  },
  db: AvailabilityClient = prisma,
): Promise<ShopDaySlot[]> {
  const { date, now = new Date() } = args;
  assertCalendarDate(date);

  const settings = await db.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    return [];
  }

  const timeZone = settings.timezone;
  const hours = await getEffectiveHours(date, db);
  const dayStart = zonedClockToUtc(date, "00:00", timeZone);
  const dayEnd = zonedClockToUtc(addCalendarDay(date), "00:00", timeZone);

  if (!hours.isOpen) {
    const leftover = await db.appointment.findMany({
      where: {
        status: "scheduled",
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { id: true, startAt: true, endAt: true },
    });
    return buildShopDaySlots({
      date,
      now,
      timeZone,
      slotIntervalMinutes: settings.slotIntervalMinutes,
      hours,
      appointments: leftover,
      blocks: [],
    });
  }

  const [appointments, blocks] = await Promise.all([
    db.appointment.findMany({
      where: {
        status: "scheduled",
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { id: true, startAt: true, endAt: true },
    }),
    db.timeBlock.findMany({
      where: {
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { id: true, startAt: true, endAt: true, reason: true },
    }),
  ]);

  return buildShopDaySlots({
    date,
    now,
    timeZone,
    slotIntervalMinutes: settings.slotIntervalMinutes,
    hours,
    appointments,
    blocks,
  });
}

export function calendarDateBounds(
  date: string,
  timeZone: string,
): { dayStart: Date; dayEnd: Date } {
  assertCalendarDate(date);
  return {
    dayStart: zonedClockToUtc(date, "00:00", timeZone),
    dayEnd: zonedClockToUtc(addCalendarDay(date), "00:00", timeZone),
  };
}

function assertCalendarDate(date: string): void {
  if (!CALENDAR_DATE.test(date)) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
}

function zonedClockToUtc(date: string, timeHHmm: string, timeZone: string): Date {
  return fromZonedTime(`${date}T${timeHHmm}:00`, timeZone);
}

function addCalendarDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function clockToMinutes(value: string): number {
  if (!CLOCK_TIME.test(value)) {
    throw new Error(`Invalid clock time: ${value}`);
  }
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToClock(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && startB < endA;
}
