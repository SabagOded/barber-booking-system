import { addMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { getAvailableSlots } from "./availability";
import { isAfterBookingWindow } from "./bookingWindow";
import {
  BookingValidationError,
  isFullName,
  normalizeCustomerName,
  normalizeIsraeliPhone,
} from "./customerFields";
import { prisma } from "./prisma";
import {
  DEMO_MAX_APPOINTMENTS,
  DemoLimitError,
  isDemoMode,
} from "./demoMode";

export {
  BookingValidationError,
  isFullName,
  normalizeCustomerName,
  normalizeIsraeliPhone,
} from "./customerFields";

const SLOT_SECONDS = /^(\d{2}):(\d{2}):00$/;

export class ServiceNotBookableError extends Error {
  constructor(message = "Service is not bookable") {
    super(message);
    this.name = "ServiceNotBookableError";
  }
}

export class InvalidSlotError extends Error {
  constructor(message = "Start time is not on a slot boundary") {
    super(message);
    this.name = "InvalidSlotError";
  }
}

export class SlotUnavailableError extends Error {
  constructor(message = "Slot is unavailable") {
    super(message);
    this.name = "SlotUnavailableError";
  }
}

type AppointmentInput = {
  serviceId: string;
  startAt: Date | string;
  customerName: string;
  now?: Date;
};

export async function createAppointment(input: AppointmentInput & { customerPhone: string }) {
  const customerName = normalizeCustomerName(input.customerName);
  if (!isFullName(customerName)) {
    throw new BookingValidationError("name", "Full name requires first and last name");
  }

  const customerPhone = normalizeIsraeliPhone(input.customerPhone.trim());
  const appointment = await createValidatedAppointment(input, customerName, customerPhone);
  return { ...appointment, customerPhone };
}

export async function createAdminAppointmentRecord(
  input: AppointmentInput & { customerPhone?: string | null },
) {
  const customerName = normalizeCustomerName(input.customerName);
  if (!isFullName(customerName)) {
    throw new BookingValidationError("name", "Full name requires first and last name");
  }

  const rawPhone = input.customerPhone?.trim() ?? "";
  const customerPhone = rawPhone ? normalizeIsraeliPhone(rawPhone) : null;
  return createValidatedAppointment(input, customerName, customerPhone);
}

async function createValidatedAppointment(
  input: AppointmentInput,
  customerName: string,
  customerPhone: string | null,
) {
  const startAt = parseStartAt(input.startAt);

  return retryOnBusy(() =>
    prisma.$transaction(
      async (tx) => {
        const locked = await tx.$executeRaw`
          UPDATE "Settings" SET "businessName" = "businessName" WHERE "id" = 1
        `;
        if (locked === 0) {
          throw new Error("Settings not found");
        }

        if (isDemoMode()) {
          const appointmentCount = await tx.appointment.count();

          if (appointmentCount >= DEMO_MAX_APPOINTMENTS) {
            throw new DemoLimitError("appointments");
          }
        }

        const now = input.now ?? new Date();

        const [settings, service] = await Promise.all([
          tx.settings.findUnique({ where: { id: 1 } }),
          tx.service.findUnique({ where: { id: input.serviceId } }),
        ]);

        if (!settings) {
          throw new Error("Settings not found");
        }
        if (!service || !service.active) {
          throw new ServiceNotBookableError();
        }

        if (!isOnSlotBoundary(startAt, settings.timezone, settings.slotIntervalMinutes)) {
          throw new InvalidSlotError();
        }

        if (isAfterBookingWindow(startAt, now, settings.timezone)) {
          throw new SlotUnavailableError();
        }

        const date = formatInTimeZone(startAt, settings.timezone, "yyyy-MM-dd");
        const slots = await getAvailableSlots(
          { serviceId: input.serviceId, date, now },
          tx,
        );
        const available = slots.some((slot) => slot.startAt.getTime() === startAt.getTime());
        if (!available) {
          throw new SlotUnavailableError();
        }
        if (startAt.getTime() <= (input.now ?? new Date()).getTime()) {
          throw new SlotUnavailableError();
        }

        return tx.appointment.create({
          data: {
            customerName,
            customerPhone,
            serviceId: service.id,
            startAt,
            endAt: addMinutes(startAt, service.durationMinutes),
            status: "scheduled",
          },
        });
      },
      { timeout: 10_000, maxWait: 10_000 },
    ),
  );
}

function parseStartAt(value: Date | string): Date {
  const startAt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(startAt.getTime())) {
    throw new BookingValidationError("startAt", "Invalid start time");
  }
  return startAt;
}

export function isOnSlotBoundary(startAt: Date, timeZone: string, intervalMinutes: number): boolean {
  if (intervalMinutes <= 0) {
    return false;
  }

  const clock = formatInTimeZone(startAt, timeZone, "HH:mm:ss");
  const match = SLOT_SECONDS.exec(clock);
  if (!match) {
    return false;
  }

  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes % intervalMinutes === 0;
}

export async function retryOnBusy<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isBusyError(error) || attempt === attempts - 1) {
        throw error;
      }
      await sleep(25 * (attempt + 1));
    }
  }

  throw lastError;
}

function isBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (
    message.includes("busy") ||
    message.includes("database is locked") ||
    message.includes("deadlock") ||
    message.includes("write conflict")
  ) {
    return true;
  }

  const code = (error as { code?: string }).code;
  return code === "P2034" || code === "P2028" || code === "P1008";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
