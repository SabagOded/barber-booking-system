import { he } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import type { Prisma } from "@prisma/client";
import {
  normalizeCustomerName,
  normalizeIsraeliPhone,
} from "./customerFields";
import { loadProtectedAdmin, type SessionCookieStore } from "./adminSession";
import { prisma } from "./prisma";
import { buildWhatsAppCustomerUrl } from "./whatsapp";

const DEFAULT_TZ = "Asia/Jerusalem";
const DEFAULT_LIMIT = 8;

export type AdminAppointmentSearchStatus = "scheduled" | "cancelled" | "completed";

export type AdminCustomerSuggestion = {
  identityKey: string;
  customerName: string;
  customerPhone: string | null;
};

export type AdminCustomerAppointment = {
  id: string;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  status: AdminAppointmentSearchStatus;
  createdAt: string;
  startAt: string;
};

export type AdminCustomerDetails = {
  identityKey: string;
  customerName: string;
  customerPhone: string | null;
  telHref: string | null;
  whatsappHref: string | null;
  nearestFutureScheduled: AdminCustomerAppointment | null;
  mostRecentlyCreated: AdminCustomerAppointment;
};

export type AdminCustomerSearchResult =
  | { ok: true; suggestions: AdminCustomerSuggestion[] }
  | { ok: false; code: "unauthenticated" };

export type AdminCustomerDetailsResult =
  | { ok: true; customer: AdminCustomerDetails }
  | { ok: false; code: "unauthenticated" | "not_found" };

type IdentityRow = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  createdAt: Date;
  startAt: Date;
};

type Identity = {
  identityKey: string;
  customerPhone: string | null;
  normalizedPhone: string | null;
};

function safeNormalizedPhone(raw: string): string | null {
  try {
    return normalizeIsraeliPhone(raw);
  } catch {
    return null;
  }
}

function identityForPhone(raw: string): Identity {
  const normalizedPhone = safeNormalizedPhone(raw);
  if (normalizedPhone) {
    return {
      identityKey: `phone:${normalizedPhone}`,
      customerPhone: normalizedPhone,
      normalizedPhone,
    };
  }

  const digits = raw.replace(/\D/g, "");
  const fallback = digits || raw.trim();
  return {
    identityKey: `legacy:${fallback}`,
    customerPhone: fallback,
    normalizedPhone: null,
  };
}

function identityForRow(row: Pick<IdentityRow, "id" | "customerPhone">): Identity {
  const phone = row.customerPhone?.trim();
  if (!phone) {
    return {
      identityKey: `appointment:${row.id}`,
      customerPhone: null,
      normalizedPhone: null,
    };
  }
  return identityForPhone(phone);
}

function compareNewest(a: IdentityRow, b: IdentityRow): number {
  return (
    b.createdAt.getTime() - a.createdAt.getTime() ||
    b.startAt.getTime() - a.startAt.getTime() ||
    b.id.localeCompare(a.id)
  );
}

export function partialPhoneNeedles(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return [];

  const needles = new Set([digits]);
  if (digits.startsWith("972") && digits.length > 3) {
    needles.add(`0${digits.slice(3)}`);
  } else if (digits.startsWith("5")) {
    needles.add(`0${digits}`);
  }
  return [...needles];
}

function matchesQuery(rows: IdentityRow[], phone: string | null, query: string): boolean {
  const normalizedQuery = normalizeCustomerName(query).toLocaleLowerCase("he");
  const nameMatch = rows.some((row) =>
    normalizeCustomerName(row.customerName).toLocaleLowerCase("he").includes(normalizedQuery),
  );
  if (nameMatch) return true;

  const phoneDigits = phone?.replace(/\D/g, "") ?? "";
  return partialPhoneNeedles(query).some((needle) => phoneDigits.includes(needle));
}

export function groupCustomerSuggestions(
  rows: IdentityRow[],
  query: string,
  limit = DEFAULT_LIMIT,
): AdminCustomerSuggestion[] {
  const normalizedQuery = normalizeCustomerName(query);
  if (normalizedQuery.length < 2) return [];

  const groups = new Map<string, { identity: Identity; rows: IdentityRow[] }>();
  for (const row of rows) {
    const identity = identityForRow(row);
    const existing = groups.get(identity.identityKey);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(identity.identityKey, { identity, rows: [row] });
    }
  }

  return [...groups.values()]
    .map((group) => ({ ...group, rows: group.rows.sort(compareNewest) }))
    .filter((group) => matchesQuery(group.rows, group.identity.customerPhone, normalizedQuery))
    .sort((a, b) => compareNewest(a.rows[0], b.rows[0]))
    .slice(0, Math.max(0, limit))
    .map((group) => ({
      identityKey: group.identity.identityKey,
      customerName: normalizeCustomerName(group.rows[0].customerName),
      customerPhone: group.identity.customerPhone,
    }));
}

export async function searchAdminCustomers(query: string): Promise<AdminCustomerSuggestion[]> {
  const normalizedQuery = normalizeCustomerName(query);
  if (normalizedQuery.length < 2) return [];

  const phoneNeedles = partialPhoneNeedles(normalizedQuery);
  const [matchedPhones, noPhoneRows] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["customerPhone"],
      where: {
        customerPhone: { not: null },
        OR: [
          { customerName: { contains: normalizedQuery } },
          ...phoneNeedles.map((needle) => ({ customerPhone: { contains: needle } })),
        ],
      },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: DEFAULT_LIMIT * 4,
    }),
    prisma.appointment.findMany({
      where: {
        customerPhone: null,
        customerName: { contains: normalizedQuery },
      },
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        createdAt: true,
        startAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { startAt: "desc" }, { id: "desc" }],
      take: DEFAULT_LIMIT,
    }),
  ]);

  const grouped = new Map<
    string,
    { identity: Identity; phones: string[]; latestMatchAt: number }
  >();
  for (const row of matchedPhones) {
    if (!row.customerPhone) continue;
    const identity = identityForPhone(row.customerPhone);
    const latestMatchAt = row._max.createdAt?.getTime() ?? 0;
    const existing = grouped.get(identity.identityKey);
    if (existing) {
      existing.phones.push(row.customerPhone);
      existing.latestMatchAt = Math.max(existing.latestMatchAt, latestMatchAt);
    } else {
      grouped.set(identity.identityKey, {
        identity,
        phones: [row.customerPhone],
        latestMatchAt,
      });
    }
  }

  const candidates = [...grouped.values()]
    .sort((a, b) => b.latestMatchAt - a.latestMatchAt)
    .slice(0, DEFAULT_LIMIT);
  const latestRows = await Promise.all(
    candidates.map((candidate) =>
      prisma.appointment.findFirst({
        where: { customerPhone: { in: candidate.phones } },
        select: { customerName: true },
        orderBy: [{ createdAt: "desc" }, { startAt: "desc" }, { id: "desc" }],
      }),
    ),
  );

  const phoneSuggestions = candidates.flatMap((candidate, index) => {
    const latest = latestRows[index];
    if (!latest) return [];
    return [{
      sortAt: candidate.latestMatchAt,
      suggestion: {
        identityKey: candidate.identity.identityKey,
        customerName: normalizeCustomerName(latest.customerName),
        customerPhone: candidate.identity.customerPhone,
      },
    }];
  });
  const noPhoneSuggestions = noPhoneRows.map((row) => ({
    sortAt: row.createdAt.getTime(),
    suggestion: {
      identityKey: `appointment:${row.id}`,
      customerName: normalizeCustomerName(row.customerName),
      customerPhone: null,
    },
  }));

  return [...phoneSuggestions, ...noPhoneSuggestions]
    .sort((a, b) => b.sortAt - a.sortAt)
    .slice(0, DEFAULT_LIMIT)
    .map((row) => row.suggestion);
}

function appointmentView(
  row: {
    id: string;
    startAt: Date;
    createdAt: Date;
    status: AdminAppointmentSearchStatus;
    service: { name: string };
  },
  timeZone: string,
): AdminCustomerAppointment {
  return {
    id: row.id,
    serviceName: row.service.name,
    dateLabel: formatInTimeZone(row.startAt, timeZone, "EEEE, d בMMMM yyyy", { locale: he }),
    timeLabel: formatInTimeZone(row.startAt, timeZone, "HH:mm"),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    startAt: row.startAt.toISOString(),
  };
}

export async function getAdminCustomerDetails(
  identityKey: string,
  now = new Date(),
): Promise<AdminCustomerDetails | null> {
  let whereCustomer: Prisma.AppointmentWhereInput;
  if (identityKey.startsWith("appointment:")) {
    const id = identityKey.slice("appointment:".length);
    if (!id) return null;
    whereCustomer = { id, customerPhone: null };
  } else {
    const distinctPhones = await prisma.appointment.findMany({
      where: { customerPhone: { not: null } },
      select: { customerPhone: true },
      distinct: ["customerPhone"],
    });
    const matchingPhones = distinctPhones
      .map((row) => row.customerPhone)
      .filter((phone): phone is string => Boolean(phone))
      .filter((phone) => identityForPhone(phone).identityKey === identityKey);
    if (matchingPhones.length === 0) return null;
    whereCustomer = { customerPhone: { in: matchingPhones } };
  }
  const appointmentSelection = {
    id: true,
    customerName: true,
    customerPhone: true,
    startAt: true,
    createdAt: true,
    status: true,
    service: { select: { name: true } },
  } as const;
  const [newest, nearestFuture, settings] = await Promise.all([
    prisma.appointment.findFirst({
      where: whereCustomer,
      select: appointmentSelection,
      orderBy: [{ createdAt: "desc" }, { startAt: "desc" }, { id: "desc" }],
    }),
    prisma.appointment.findFirst({
      where: {
        ...whereCustomer,
        status: "scheduled",
        startAt: { gt: now },
      },
      select: appointmentSelection,
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
    }),
    prisma.settings.findUnique({ where: { id: 1 }, select: { timezone: true } }),
  ]);
  if (!newest) return null;

  const identity = identityForRow(newest);
  const timeZone = settings?.timezone ?? DEFAULT_TZ;

  return {
    identityKey,
    customerName: normalizeCustomerName(newest.customerName),
    customerPhone: identity.customerPhone,
    telHref: identity.customerPhone ? `tel:${identity.customerPhone}` : null,
    whatsappHref: identity.normalizedPhone
      ? buildWhatsAppCustomerUrl(identity.normalizedPhone)
      : null,
    nearestFutureScheduled: nearestFuture ? appointmentView(nearestFuture, timeZone) : null,
    mostRecentlyCreated: appointmentView(newest, timeZone),
  };
}

export async function searchAdminCustomersAuthed(
  store: SessionCookieStore,
  query: string,
): Promise<AdminCustomerSearchResult> {
  const gate = await loadProtectedAdmin(store);
  if (!gate.ok) return { ok: false, code: "unauthenticated" };
  return { ok: true, suggestions: await searchAdminCustomers(query) };
}

export async function getAdminCustomerDetailsAuthed(
  store: SessionCookieStore,
  identityKey: string,
): Promise<AdminCustomerDetailsResult> {
  const gate = await loadProtectedAdmin(store);
  if (!gate.ok) return { ok: false, code: "unauthenticated" };
  const customer = await getAdminCustomerDetails(identityKey);
  return customer ? { ok: true, customer } : { ok: false, code: "not_found" };
}
