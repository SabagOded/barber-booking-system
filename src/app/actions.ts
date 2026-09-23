"use server";

import { he } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { buildDaySlotGrid, calendarDateBounds, getDaySlotGrid } from "@/lib/availability";
import {
  BookingValidationError,
  createAppointment,
  InvalidSlotError,
  ServiceNotBookableError,
  SlotUnavailableError,
} from "@/lib/booking";
import { lastBookableDate, thisMonthStart } from "@/lib/bookingWindow";
import { prisma } from "@/lib/prisma";
import { resolveEffectiveHours } from "@/lib/shopHours";
import { getPublicTicketStatus as loadPublicTicketStatus } from "@/lib/publicTicket";
import { DemoLimitError } from "@/lib/demoMode";
import { resetDemoIfExpired } from "@/lib/demoReset";

export type DayOption = {
  date: string;
  weekday: string;
  dayMonth: string;
  dayNumber: string;
  weekdayIndex: number;
  monthKey: string;
  isToday: boolean;
  available: boolean;
  occupancy: "open" | "closed" | "full" | "past";
};

export type SlotOption = {
  startAtIso: string;
  label: string;
  status: "available" | "taken" | "past";
};

export type BookResult =
  | {
      ok: true;
      appointment: {
        id: string;
        customerName: string;
        customerPhone: string;
        serviceId: string;
        startAtIso: string;
        endAtIso: string;
      };
    }
  | {
      ok: false;
      code:
        | "slot_unavailable"
        | "invalid_slot"
        | "service_unavailable"
        | "validation_name"
        | "validation_phone"
        | "demo_limit"
        | "generic";
    };

export async function getBookableDays(serviceId: string): Promise<DayOption[]> {
  const now = new Date();
  let settings = await prisma.settings.findUnique({
    where: { id: 1 },
    select: { timezone: true, slotIntervalMinutes: true, demoResetAt: true },
  });
  if (await resetDemoIfExpired(now, settings)) {
    settings = await prisma.settings.findUnique({
      where: { id: 1 },
      select: { timezone: true, slotIntervalMinutes: true, demoResetAt: true },
    });
  }
  if (!settings) {
    throw new Error("Settings not found");
  }

  const timeZone = settings.timezone;
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const start = thisMonthStart(now, timeZone);
  const end = lastBookableDate(now, timeZone);
  const dates: string[] = [];
  for (let date = start; date <= end; date = addCalendarDays(date, 1)) {
    dates.push(date);
  }

  const { dayStart: rangeStart } = calendarDateBounds(start, timeZone);
  const { dayEnd: rangeEnd } = calendarDateBounds(end, timeZone);
  const [service, closedRows, hoursRows, overrideRows, appointments, blocks] = await Promise.all([
    prisma.service.findUnique({
      where: { id: serviceId },
      select: { active: true, durationMinutes: true },
    }),
    prisma.closedDate.findMany({ where: { date: { gte: start, lte: end } } }),
    prisma.workingHours.findMany(),
    prisma.hoursOverride.findMany({ where: { date: { gte: start, lte: end } } }),
    prisma.appointment.findMany({
      where: {
        status: "scheduled",
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
      select: { startAt: true, endAt: true },
    }),
    prisma.timeBlock.findMany({
      where: {
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);
  if (!service) {
    throw new Error("Service not found");
  }
  const closedSet = new Set(closedRows.map((row) => row.date));
  const hoursByWeekday = new Map(hoursRows.map((row) => [row.weekday, row]));
  const overrideByDate = new Map(overrideRows.map((row) => [row.date, row]));

  return dates.map((date) => {
    const noon = fromZonedTime(`${date}T12:00:00`, timeZone);
    const weekdayIndex = Number(formatInTimeZone(noon, timeZone, "i")) % 7;
    const weekday = formatInTimeZone(noon, timeZone, "EEEE", { locale: he });
    const dayMonth = formatInTimeZone(noon, timeZone, "d.M", { locale: he });
    const dayNumber = formatInTimeZone(noon, timeZone, "d");
    const override = overrideByDate.get(date);
    const effective = resolveEffectiveHours({
      override: override ? { openTime: override.openTime, closeTime: override.closeTime } : null,
      closed: closedSet.has(date),
      template: hoursByWeekday.get(weekdayIndex) ?? null,
    });

    let occupancy: DayOption["occupancy"] = "closed";
    let available = false;

    if (!effective.isOpen) {
      occupancy = "closed";
    } else if (date < today) {
      occupancy = "past";
    } else {
      const slots = buildDaySlotGrid({
        date,
        now,
        settings,
        service,
        hours: effective,
        appointments,
        blocks,
      });
      available = slots.some((slot) => slot.status === "available");
      occupancy = available ? "open" : "full";
    }

    return {
      date,
      weekday,
      dayMonth,
      dayNumber,
      weekdayIndex,
      monthKey: date.slice(0, 7),
      isToday: date === today,
      available,
      occupancy,
    };
  });
}

export async function getSlots(serviceId: string, date: string): Promise<SlotOption[]> {
  await resetDemoIfExpired();
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    throw new Error("Settings not found");
  }

  const slots = await getDaySlotGrid({ serviceId, date });
  return slots.map((slot) => ({
    startAtIso: slot.startAt.toISOString(),
    label: formatInTimeZone(slot.startAt, settings.timezone, "HH:mm"),
    status: slot.status,
  }));
}

export async function bookAppointment(input: {
  serviceId: string;
  startAtIso: string;
  customerName: string;
  customerPhone: string;
}): Promise<BookResult> {
  try {
    await resetDemoIfExpired();
    const appointment = await createAppointment({
      serviceId: input.serviceId,
      startAt: input.startAtIso,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
    });

    return {
      ok: true,
      appointment: {
        id: appointment.id,
        customerName: appointment.customerName,
        customerPhone: appointment.customerPhone,
        serviceId: appointment.serviceId,
        startAtIso: appointment.startAt.toISOString(),
        endAtIso: appointment.endAt.toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof DemoLimitError) {
      return { ok: false, code: "demo_limit" };
    }
    if (error instanceof SlotUnavailableError) {
      return { ok: false, code: "slot_unavailable" };
    }
    if (error instanceof InvalidSlotError) {
      return { ok: false, code: "invalid_slot" };
    }
    if (error instanceof ServiceNotBookableError) {
      return { ok: false, code: "service_unavailable" };
    }
    if (error instanceof BookingValidationError) {
      if (error.field === "name") {
        return { ok: false, code: "validation_name" };
      }
      if (error.field === "phone") {
        return { ok: false, code: "validation_phone" };
      }
    }
    return { ok: false, code: "generic" };
  }
}

export async function getPublicTicketStatus(id: string) {
  await resetDemoIfExpired();
  return loadPublicTicketStatus({ id });
}

function addCalendarDays(date: string, amount: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return next.toISOString().slice(0, 10);
}
