import { he } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { loadProtectedAdmin, type SessionCookieStore } from "./adminSession";
import { buildShopDaySlots, getAvailableSlots, type ShopSlotKind } from "./availability";
import {
  BookingValidationError,
  createAdminAppointmentRecord,
  InvalidSlotError,
  isOnSlotBoundary,
  retryOnBusy,
  ServiceNotBookableError,
  SlotUnavailableError,
} from "./booking";
import { calendarDateInZone, isAfterBookingWindow } from "./bookingWindow";
import { prisma } from "./prisma";
import {
  resolveEffectiveHours,
  weekdayInTimeZone,
  type EffectiveHours,
} from "./shopHours";
import {
  DEMO_MAX_TIME_BLOCKS,
  DemoLimitError,
  isDemoMode,
} from "./demoMode";

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TZ = "Asia/Jerusalem";

export type AdminAppointmentStatus = "scheduled" | "cancelled" | "completed";

export type AdminDayAppointment = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  serviceName: string;
  startAt: Date;
  endAt: Date;
  startLabel: string;
  endLabel: string;
  status: AdminAppointmentStatus;
  canCancel: boolean;
  canReschedule: boolean;
};

export type AdminDayBlock = {
  id: string;
  startAt: Date;
  endAt: Date;
  startLabel: string;
  endLabel: string;
  reason: string | null;
  past: boolean;
};

export type AdminHourSlot = {
  startLabel: string;
  endLabel: string;
  startAtIso: string;
  endAtIso: string;
  kind: ShopSlotKind;
  past: boolean;
  appointmentId?: string;
  blockId?: string;
  reason?: string | null;
};

export type AdminDay = {
  date: string;
  timeZone: string;
  shopName: string;
  weekday: string;
  dateLabel: string;
  headline: string;
  hours: EffectiveHours;
  services: { id: string; name: string; durationMinutes: number }[];
  appointments: AdminDayAppointment[];
  blocks: AdminDayBlock[];
  slots: AdminHourSlot[];
};

export type CancelAdminResult =
  | { ok: true; alreadyCancelled?: boolean }
  | { ok: false; code: "not_found" | "not_scheduled" | "past" };

export type AuthedDayResult =
  | { ok: true; day: AdminDay }
  | { ok: false; code: "unauthenticated" };

export type AuthedCancelResult =
  | { ok: true; alreadyCancelled?: boolean }
  | { ok: false; code: "unauthenticated" | "not_found" | "not_scheduled" | "past" };

export type WalkInResult =
  | { ok: true; id: string }
  | {
      ok: false;
      code:
        | "unauthenticated"
        | "slot_unavailable"
        | "validation_name"
        | "validation_phone"
        | "phone_confirmation_required"
        | "service_unavailable"
        | "demo_limit"
        | "generic";
    };

export type BlockWriteResult =
  | { ok: true; id: string }
  | {
      ok: false;
      code: "unauthenticated" | "overlap" | "invalid_range" | "demo_limit";
  };

export type DeleteBlockResult =
  | { ok: true }
  | { ok: false; code: "unauthenticated" | "not_found" | "past" | "invalid_range" };

export type RescheduleFailureCode =
  | "unauthenticated"
  | "not_found"
  | "not_scheduled"
  | "past"
  | "invalid_slot"
  | "slot_unavailable";

export type RescheduleSlotsResult =
  | {
      ok: true;
      date: string;
      weekday: string;
      dateLabel: string;
      slots: { startAtIso: string; endAtIso: string; startLabel: string; endLabel: string }[];
    }
  | { ok: false; code: RescheduleFailureCode };

export type RescheduleAdminResult =
  | { ok: true; id: string; startAt: Date; endAt: Date }
  | { ok: false; code: Exclude<RescheduleFailureCode, "unauthenticated"> };

export type AuthedRescheduleResult =
  | RescheduleAdminResult
  | { ok: false; code: "unauthenticated" };

export function shiftCalendarDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) {
    return false;
  }
  return calendarDateInZone(fromZonedTime(`${value}T12:00:00`, DEFAULT_TZ), DEFAULT_TZ) === value;
}

export function formatAdminDayParts(date: string, timeZone: string): {
  weekday: string;
  dateLabel: string;
  headline: string;
} {
  const noon = fromZonedTime(`${date}T12:00:00`, timeZone);
  const weekday = formatInTimeZone(noon, timeZone, "EEEE", { locale: he });
  const dateLabel = formatInTimeZone(noon, timeZone, "d בMMMM yyyy", { locale: he });
  return { weekday, dateLabel, headline: `${weekday}, ${dateLabel}` };
}

export function formatAdminDayHeadline(date: string, timeZone: string): string {
  return formatAdminDayParts(date, timeZone).headline;
}

function dayBounds(date: string, timeZone: string): { dayStart: Date; dayEnd: Date } {
  return {
    dayStart: fromZonedTime(`${date}T00:00:00`, timeZone),
    dayEnd: fromZonedTime(`${shiftCalendarDate(date, 1)}T00:00:00`, timeZone),
  };
}

function clockLabel(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "HH:mm");
}

export async function getAdminDay(input: { date?: string; now?: Date } = {}): Promise<AdminDay> {
  const now = input.now ?? new Date();
  const settings = await prisma.settings.findUnique({
    where: { id: 1 },
    select: { timezone: true, slotIntervalMinutes: true, businessName: true },
  });
  const timeZone = settings?.timezone ?? DEFAULT_TZ;
  const date =
    input.date && isCalendarDate(input.date) ? input.date : calendarDateInZone(now, timeZone);
  const { dayStart, dayEnd } = dayBounds(date, timeZone);
  const weekdayIndex = weekdayInTimeZone(date, timeZone);

  const [appointmentRows, blockRows, services, override, closed, template] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        startAt: true,
        endAt: true,
        status: true,
        service: { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.timeBlock.findMany({
      where: {
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { id: true, startAt: true, endAt: true, reason: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.service.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, durationMinutes: true },
    }),
    prisma.hoursOverride.findUnique({
      where: { date },
      select: { openTime: true, closeTime: true },
    }),
    prisma.closedDate.findUnique({ where: { date }, select: { id: true } }),
    prisma.workingHours.findUnique({
      where: { weekday: weekdayIndex },
      select: { isOpen: true, openTime: true, closeTime: true },
    }),
  ]);
  const hours = resolveEffectiveHours({
    override,
    closed: Boolean(closed),
    template,
  });
  const shopSlots = settings
    ? buildShopDaySlots({
        date,
        now,
        timeZone,
        slotIntervalMinutes: settings.slotIntervalMinutes,
        hours,
        appointments: appointmentRows.filter((row) => row.status === "scheduled"),
        blocks: blockRows,
      })
    : [];

  const parts = formatAdminDayParts(date, timeZone);
  return {
    date,
    timeZone,
    shopName: settings?.businessName ?? "",
    weekday: parts.weekday,
    dateLabel: parts.dateLabel,
    headline: parts.headline,
    hours,
    services,
    appointments: appointmentRows.map((row) => ({
      id: row.id,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      serviceName: row.service.name,
      startAt: row.startAt,
      endAt: row.endAt,
      startLabel: clockLabel(row.startAt, timeZone),
      endLabel: clockLabel(row.endAt, timeZone),
      status: row.status,
      canCancel: row.status === "scheduled" && row.startAt.getTime() > now.getTime(),
      canReschedule: row.status === "scheduled" && row.startAt.getTime() > now.getTime(),
    })),
    blocks: blockRows.map((row) => ({
      id: row.id,
      startAt: row.startAt,
      endAt: row.endAt,
      startLabel: clockLabel(row.startAt, timeZone),
      endLabel: clockLabel(row.endAt, timeZone),
      reason: row.reason,
      past: row.startAt.getTime() <= now.getTime(),
    })),
    slots: shopSlots.map((slot) => ({
      startLabel: clockLabel(slot.startAt, timeZone),
      endLabel: clockLabel(slot.endAt, timeZone),
      startAtIso: slot.startAt.toISOString(),
      endAtIso: slot.endAt.toISOString(),
      kind: slot.kind,
      past: slot.startAt.getTime() <= now.getTime(),
      appointmentId: slot.appointmentId,
      blockId: slot.blockId,
      reason: slot.reason,
    })),
  };
}

export async function cancelAdminAppointment(input: {
  id: string;
  now?: Date;
}): Promise<CancelAdminResult> {
  const id = input.id.trim();
  if (!id) {
    return { ok: false, code: "not_found" };
  }

  return retryOnBusy(() =>
    prisma.$transaction(
      async (tx) => {
        const locked = await tx.$executeRaw`
          UPDATE "Settings" SET "businessName" = "businessName" WHERE "id" = 1
        `;
        if (locked === 0) {
          throw new Error("Settings not found");
        }

        const existing = await tx.appointment.findUnique({
          where: { id },
          select: { id: true, status: true, startAt: true },
        });
        if (!existing) {
          return { ok: false as const, code: "not_found" as const };
        }
        if (existing.status === "cancelled") {
          return { ok: true as const, alreadyCancelled: true };
        }
        if (existing.status !== "scheduled") {
          return { ok: false as const, code: "not_scheduled" as const };
        }

        const now = input.now ?? new Date();
        if (existing.startAt.getTime() <= now.getTime()) {
          return { ok: false as const, code: "past" as const };
        }

        const updated = await tx.appointment.updateMany({
          where: { id, status: "scheduled" },
          data: { status: "cancelled", cancelledAt: now },
        });
        return updated.count === 1
          ? { ok: true as const }
          : { ok: false as const, code: "not_scheduled" as const };
      },
      { timeout: 10_000, maxWait: 10_000 },
    ),
  );
}

export async function getAdminDayAuthed(
  store: SessionCookieStore,
  date?: string,
  now?: Date,
): Promise<AuthedDayResult> {
  const gate = await loadProtectedAdmin(store);
  if (!gate.ok) {
    return { ok: false, code: "unauthenticated" };
  }
  return { ok: true, day: await getAdminDay({ date, now }) };
}

export async function cancelAdminAppointmentAuthed(
  store: SessionCookieStore,
  id: string,
  now?: Date,
): Promise<AuthedCancelResult> {
  const gate = await loadProtectedAdmin(store);
  if (!gate.ok) {
    return { ok: false, code: "unauthenticated" };
  }
  return cancelAdminAppointment({ id, now });
}

async function loadRescheduleCandidate(id: string, now: Date) {
  const existing = await prisma.appointment.findUnique({
    where: { id },
    select: { id: true, serviceId: true, status: true, startAt: true, endAt: true },
  });
  if (!existing) {
    return { ok: false as const, code: "not_found" as const };
  }
  if (existing.status !== "scheduled") {
    return { ok: false as const, code: "not_scheduled" as const };
  }
  if (existing.startAt.getTime() <= now.getTime()) {
    return { ok: false as const, code: "past" as const };
  }
  return { ok: true as const, existing };
}

export async function getAdminRescheduleSlots(input: {
  id: string;
  date: string;
  now?: Date;
}): Promise<RescheduleSlotsResult> {
  const id = input.id.trim();
  if (!id) {
    return { ok: false, code: "not_found" };
  }
  if (!isCalendarDate(input.date)) {
    return { ok: false, code: "invalid_slot" };
  }

  const now = input.now ?? new Date();
  const candidate = await loadRescheduleCandidate(id, now);
  if (!candidate.ok) {
    return candidate;
  }
  const durationMs = candidate.existing.endAt.getTime() - candidate.existing.startAt.getTime();
  if (durationMs <= 0) {
    return { ok: false, code: "invalid_slot" };
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    return { ok: false, code: "slot_unavailable" };
  }
  const probe = fromZonedTime(`${input.date}T12:00:00`, settings.timezone);
  if (isAfterBookingWindow(probe, now, settings.timezone)) {
    return { ok: true, date: input.date, ...formatAdminDayParts(input.date, settings.timezone), slots: [] };
  }

  const slots = await getAvailableSlots({
    serviceId: candidate.existing.serviceId,
    date: input.date,
    now,
    durationMs,
    excludeAppointmentId: id,
  });
  return {
    ok: true,
    date: input.date,
    ...formatAdminDayParts(input.date, settings.timezone),
    slots: slots.map((slot) => ({
      startAtIso: slot.startAt.toISOString(),
      endAtIso: slot.endAt.toISOString(),
      startLabel: clockLabel(slot.startAt, settings.timezone),
      endLabel: clockLabel(slot.endAt, settings.timezone),
    })),
  };
}

export async function getAdminRescheduleSlotsAuthed(
  store: SessionCookieStore,
  input: { id: string; date: string; now?: Date },
): Promise<RescheduleSlotsResult> {
  const gate = await loadProtectedAdmin(store);
  if (!gate.ok) {
    return { ok: false, code: "unauthenticated" };
  }
  return getAdminRescheduleSlots(input);
}

export async function rescheduleAdminAppointment(input: {
  id: string;
  startAt: Date | string;
  now?: Date;
}): Promise<RescheduleAdminResult> {
  const id = input.id.trim();
  if (!id) {
    return { ok: false, code: "not_found" };
  }
  const startAt = parseInstant(input.startAt);
  if (!startAt) {
    return { ok: false, code: "invalid_slot" };
  }
  return retryOnBusy(() =>
    prisma.$transaction(
      async (tx) => {
        const locked = await tx.$executeRaw`
          UPDATE "Settings" SET "businessName" = "businessName" WHERE "id" = 1
        `;
        if (locked === 0) {
          return { ok: false as const, code: "slot_unavailable" as const };
        }
        const now = input.now ?? new Date();

        const [existing, settings] = await Promise.all([
          tx.appointment.findUnique({
            where: { id },
            select: { id: true, serviceId: true, status: true, startAt: true, endAt: true },
          }),
          tx.settings.findUnique({ where: { id: 1 } }),
        ]);
        if (!existing) {
          return { ok: false as const, code: "not_found" as const };
        }
        if (existing.status !== "scheduled") {
          return { ok: false as const, code: "not_scheduled" as const };
        }
        if (existing.startAt.getTime() <= now.getTime()) {
          return { ok: false as const, code: "past" as const };
        }
        if (!settings || !isOnSlotBoundary(startAt, settings.timezone, settings.slotIntervalMinutes)) {
          return { ok: false as const, code: "invalid_slot" as const };
        }
        if (isAfterBookingWindow(startAt, now, settings.timezone)) {
          return { ok: false as const, code: "slot_unavailable" as const };
        }

        const durationMs = existing.endAt.getTime() - existing.startAt.getTime();
        if (durationMs <= 0) {
          return { ok: false as const, code: "invalid_slot" as const };
        }
        const date = calendarDateInZone(startAt, settings.timezone);
        const slots = await getAvailableSlots(
          {
            serviceId: existing.serviceId,
            date,
            now,
            durationMs,
            excludeAppointmentId: id,
          },
          tx,
        );
        if (!slots.some((slot) => slot.startAt.getTime() === startAt.getTime())) {
          return { ok: false as const, code: "slot_unavailable" as const };
        }
        if (startAt.getTime() <= (input.now ?? new Date()).getTime()) {
          return { ok: false as const, code: "slot_unavailable" as const };
        }

        const endAt = new Date(startAt.getTime() + durationMs);
        const updated = await tx.appointment.update({
          where: { id },
          data: { startAt, endAt },
          select: { id: true, startAt: true, endAt: true },
        });
        return { ok: true as const, ...updated };
      },
      { timeout: 10_000, maxWait: 10_000 },
    ),
  );
}

export async function rescheduleAdminAppointmentAuthed(
  store: SessionCookieStore,
  input: { id: string; startAt: Date | string; now?: Date },
): Promise<AuthedRescheduleResult> {
  const gate = await loadProtectedAdmin(store);
  if (!gate.ok) {
    return { ok: false, code: "unauthenticated" };
  }
  return rescheduleAdminAppointment(input);
}

export async function createAdminWalkIn(input: {
  serviceId: string;
  startAt: Date | string;
  customerName: string;
  customerPhone?: string | null;
  confirmedWithoutPhone?: boolean;
  now?: Date;
}): Promise<WalkInResult> {
  if (!input.customerPhone?.trim() && !input.confirmedWithoutPhone) {
    return { ok: false, code: "phone_confirmation_required" };
  }
  try {
    const row = await createAdminAppointmentRecord(input);
    return { ok: true, id: row.id };
  } catch (error) {
    if (error instanceof BookingValidationError) {
      if (error.field === "name") {
        return { ok: false, code: "validation_name" };
      }
      if (error.field === "phone") {
        return { ok: false, code: "validation_phone" };
      }
      return { ok: false, code: "generic" };
    }
    if (error instanceof SlotUnavailableError || error instanceof InvalidSlotError) {
      return { ok: false, code: "slot_unavailable" };
    }
    if (error instanceof ServiceNotBookableError) {
      return { ok: false, code: "service_unavailable" };
    }
    if (error instanceof DemoLimitError) {
      return { ok: false, code: "demo_limit" };
    }
    return { ok: false, code: "generic" };
  }
}

export async function createAdminWalkInAuthed(
  store: SessionCookieStore,
  input: {
    serviceId: string;
    startAt: Date | string;
    customerName: string;
    customerPhone?: string | null;
    confirmedWithoutPhone?: boolean;
    now?: Date;
  },
): Promise<WalkInResult> {
  const gate = await loadProtectedAdmin(store);
  if (!gate.ok) {
    return { ok: false, code: "unauthenticated" };
  }
  return createAdminWalkIn(input);
}

function parseInstant(value: Date | string): Date | null {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  return instant;
}

export async function createAdminTimeBlock(input: {
  startAt: Date | string;
  endAt: Date | string;
  reason?: string;
}): Promise<BlockWriteResult> {
  const startAt = parseInstant(input.startAt);
  const endAt = parseInstant(input.endAt);
  if (!startAt || !endAt || endAt.getTime() <= startAt.getTime()) {
    return { ok: false, code: "invalid_range" };
  }

  const reason = input.reason?.trim() || null;
  return retryOnBusy(() =>
    prisma.$transaction(
      async (tx) => {
        const locked = await tx.$executeRaw`
          UPDATE "Settings" SET "businessName" = "businessName" WHERE "id" = 1
        `;
        if (locked === 0) {
          return { ok: false as const, code: "invalid_range" as const };
        }
        if (isDemoMode()) {
          const timeBlockCount = await tx.timeBlock.count();

          if (timeBlockCount >= DEMO_MAX_TIME_BLOCKS) {
            return { ok: false as const, code: "demo_limit" as const };
          }
        }

        const settings = await tx.settings.findUnique({ where: { id: 1 } });
        const timeZone = settings?.timezone ?? DEFAULT_TZ;
        const startDay = calendarDateInZone(startAt, timeZone);
        const endDay = calendarDateInZone(new Date(endAt.getTime() - 1), timeZone);
        if (startDay !== endDay) {
          return { ok: false as const, code: "invalid_range" as const };
        }

        const [overlapping, overlappingBlock] = await Promise.all([
          tx.appointment.findFirst({
            where: {
              status: "scheduled",
              startAt: { lt: endAt },
              endAt: { gt: startAt },
            },
            select: { id: true },
          }),
          tx.timeBlock.findFirst({
            where: {
              startAt: { lt: endAt },
              endAt: { gt: startAt },
            },
            select: { id: true },
          }),
        ]);
        if (overlapping || overlappingBlock) {
          return { ok: false as const, code: "overlap" as const };
        }

        const row = await tx.timeBlock.create({
          data: { startAt, endAt, reason },
        });
        return { ok: true as const, id: row.id };
      },
      { timeout: 10_000, maxWait: 10_000 },
    ),
  );
}

export async function createAdminTimeBlockAuthed(
  store: SessionCookieStore,
  input: { startAt: Date | string; endAt: Date | string; reason?: string },
): Promise<BlockWriteResult> {
  const gate = await loadProtectedAdmin(store);
  if (!gate.ok) {
    return { ok: false, code: "unauthenticated" };
  }
  return createAdminTimeBlock(input);
}

export async function deleteAdminTimeBlock(
  id: string,
  now: Date = new Date(),
  reopenFrom?: Date | string,
): Promise<DeleteBlockResult> {
  const trimmed = id.trim();
  if (!trimmed) {
    return { ok: false, code: "not_found" };
  }
  return retryOnBusy(() =>
    prisma.$transaction(
      async (tx) => {
        const locked = await tx.$executeRaw`
          UPDATE "Settings" SET "businessName" = "businessName" WHERE "id" = 1
        `;
        if (locked === 0) {
          return { ok: false as const, code: "not_found" as const };
        }

        const existing = await tx.timeBlock.findUnique({
          where: { id: trimmed },
          select: { id: true, startAt: true, endAt: true },
        });
        if (!existing) {
          return { ok: false as const, code: "not_found" as const };
        }
        const reopenAt = reopenFrom === undefined ? existing.startAt : parseInstant(reopenFrom);
        if (!reopenAt || reopenAt.getTime() < existing.startAt.getTime() || reopenAt.getTime() > existing.endAt.getTime()) {
          return { ok: false as const, code: "invalid_range" as const };
        }
        if (reopenAt.getTime() <= now.getTime()) {
          return { ok: false as const, code: "past" as const };
        }
        if (reopenAt.getTime() === existing.startAt.getTime()) {
          await tx.timeBlock.delete({ where: { id: trimmed } });
        } else {
          await tx.timeBlock.update({
            where: { id: trimmed },
            data: { endAt: reopenAt },
          });
        }
        return { ok: true as const };
      },
      { timeout: 10_000, maxWait: 10_000 },
    ),
  );
}

export async function deleteAdminTimeBlockAuthed(
  store: SessionCookieStore,
  id: string,
  now?: Date,
  reopenFrom?: Date | string,
): Promise<DeleteBlockResult> {
  const gate = await loadProtectedAdmin(store);
  if (!gate.ok) {
    return { ok: false, code: "unauthenticated" };
  }
  return deleteAdminTimeBlock(id, now, reopenFrom);
}
