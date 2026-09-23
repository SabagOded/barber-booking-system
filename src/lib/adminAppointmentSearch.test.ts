import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  getAdminCustomerDetails,
  getAdminCustomerDetailsAuthed,
  groupCustomerSuggestions,
  partialPhoneNeedles,
  searchAdminCustomers,
  searchAdminCustomersAuthed,
} from "./adminAppointmentSearch";
import { createSession, type SessionCookieStore } from "./adminSession";
import { prisma } from "./prisma";
import { prepareTestDb, resetTestDb } from "@/test/resetTestDb";

const TZ = "Asia/Jerusalem";

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
      businessName: "העסק",
      providerName: "נותן השירות",
      phone: "0500000000",
      whatsappPhone: "972500000000",
      timezone: TZ,
      slotIntervalMinutes: 30,
    },
  });
  return prisma.service.create({
    data: { name: "שירות", durationMinutes: 30, priceAgorot: 8000, sortOrder: 1 },
  });
}

async function appointment(input: {
  serviceId: string;
  name: string;
  phone: string | null;
  startAt: Date;
  createdAt: Date;
  status?: "scheduled" | "cancelled" | "completed";
}) {
  return prisma.appointment.create({
    data: {
      customerName: input.name,
      customerPhone: input.phone,
      serviceId: input.serviceId,
      startAt: input.startAt,
      endAt: new Date(input.startAt.getTime() + 30 * 60_000),
      createdAt: input.createdAt,
      status: input.status ?? "scheduled",
    },
  });
}

describe("admin appointment search", () => {
  beforeAll(prepareTestDb);
  beforeEach(resetTestDb);
  afterEach(resetTestDb);
  afterAll(async () => prisma.$disconnect());

  it("finds partial names and uses the latest name for the normalized phone identity", async () => {
    const service = await seedBase();
    await appointment({
      serviceId: service.id,
      name: "דוד כהן",
      phone: "0501234567",
      startAt: jerusalem("2026-09-10", "10:00"),
      createdAt: jerusalem("2026-09-01", "09:00"),
    });
    await appointment({
      serviceId: service.id,
      name: "דוד לוי",
      phone: "0501234567",
      startAt: jerusalem("2026-09-20", "10:00"),
      createdAt: jerusalem("2026-09-02", "09:00"),
    });

    expect(await searchAdminCustomers("כה")).toEqual([
      { identityKey: "phone:0501234567", customerName: "דוד לוי", customerPhone: "0501234567" },
    ]);
  });

  it("matches partial local and international phone input and deduplicates formats", () => {
    const rows = [
      {
        id: "older",
        customerName: "דוד כהן",
        customerPhone: "+972 50-123-4567",
        createdAt: new Date("2026-09-01T09:00:00Z"),
        startAt: new Date("2026-09-10T09:00:00Z"),
      },
      {
        id: "newer",
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        createdAt: new Date("2026-09-02T09:00:00Z"),
        startAt: new Date("2026-09-11T09:00:00Z"),
      },
    ];

    expect(groupCustomerSuggestions(rows, "+972 50-12")).toHaveLength(1);
    expect(groupCustomerSuggestions(rows, "50123")).toHaveLength(1);
  });

  it("filters partial phone queries in the database before grouping results", async () => {
    const service = await seedBase();
    await appointment({
      serviceId: service.id,
      name: "דוד כהן",
      phone: "0501234567",
      startAt: jerusalem("2026-09-10", "10:00"),
      createdAt: jerusalem("2026-09-01", "09:00"),
    });
    await appointment({
      serviceId: service.id,
      name: "משה לוי",
      phone: "0527654321",
      startAt: jerusalem("2026-09-11", "10:00"),
      createdAt: jerusalem("2026-09-02", "09:00"),
    });

    expect((await searchAdminCustomers("50123")).map((row) => row.customerPhone)).toEqual([
      "0501234567",
    ]);
    expect((await searchAdminCustomers("משה")).map((row) => row.customerPhone)).toEqual([
      "0527654321",
    ]);
  });

  it("does not turn a bare +972 prefix into a match for every local phone", async () => {
    const service = await seedBase();
    await appointment({
      serviceId: service.id,
      name: "דוד כהן",
      phone: "0501234567",
      startAt: jerusalem("2026-09-10", "10:00"),
      createdAt: jerusalem("2026-09-01", "09:00"),
    });

    expect(partialPhoneNeedles("+972")).toEqual(["972"]);
    expect(await searchAdminCustomers("+972")).toEqual([]);
    expect((await searchAdminCustomers("+972 50-12")).map((row) => row.customerPhone)).toEqual([
      "0501234567",
    ]);
  });

  it("keeps identical names with different phones as separate suggestions", () => {
    const base = {
      customerName: "דוד כהן",
      createdAt: new Date("2026-09-02T09:00:00Z"),
      startAt: new Date("2026-09-11T09:00:00Z"),
    };
    const results = groupCustomerSuggestions(
      [
        { ...base, id: "one", customerPhone: "0501111111" },
        { ...base, id: "two", customerPhone: "0502222222" },
      ],
      "דוד",
    );
    expect(results.map((result) => result.customerPhone)).toEqual(["0502222222", "0501111111"]);
  });

  it("returns no suggestions for short or unmatched input", async () => {
    const service = await seedBase();
    await appointment({
      serviceId: service.id,
      name: "דוד כהן",
      phone: "0501234567",
      startAt: jerusalem("2026-09-10", "10:00"),
      createdAt: jerusalem("2026-09-01", "09:00"),
    });
    expect(await searchAdminCustomers("ד")).toEqual([]);
    expect(await searchAdminCustomers("משה")).toEqual([]);
  });

  it("returns only the nearest future scheduled appointment and newest createdAt row", async () => {
    const service = await seedBase();
    const olderCreatedFuture = await appointment({
      serviceId: service.id,
      name: "דוד כהן",
      phone: "0501234567",
      startAt: jerusalem("2026-10-20", "12:00"),
      createdAt: jerusalem("2026-09-01", "09:00"),
      status: "scheduled",
    });
    const newestCreatedPast = await appointment({
      serviceId: service.id,
      name: "דוד כהן",
      phone: "0501234567",
      startAt: jerusalem("2026-09-05", "10:00"),
      createdAt: jerusalem("2026-09-03", "09:00"),
      status: "completed",
    });
    await appointment({
      serviceId: service.id,
      name: "דוד כהן",
      phone: "0501234567",
      startAt: jerusalem("2026-10-25", "11:00"),
      createdAt: jerusalem("2026-09-02", "09:00"),
      status: "cancelled",
    });
    await appointment({
      serviceId: service.id,
      name: "דוד כהן",
      phone: "0501234567",
      startAt: jerusalem("2026-11-01", "09:00"),
      createdAt: jerusalem("2026-08-30", "09:00"),
      status: "scheduled",
    });

    const details = await getAdminCustomerDetails(
      "phone:0501234567",
      jerusalem("2026-09-17", "10:00"),
    );
    expect(details?.mostRecentlyCreated.id).toBe(newestCreatedPast.id);
    expect(details?.mostRecentlyCreated.status).toBe("completed");
    expect(details?.nearestFutureScheduled?.id).toBe(olderCreatedFuture.id);
    expect(details?.nearestFutureScheduled?.status).toBe("scheduled");
    expect(details?.whatsappHref).toBe("https://wa.me/972501234567");
  });

  it("returns no future appointment when only past or cancelled rows exist", async () => {
    const service = await seedBase();
    const newest = await appointment({
      serviceId: service.id,
      name: "דוד כהן",
      phone: "0501234567",
      startAt: jerusalem("2026-10-20", "12:00"),
      createdAt: jerusalem("2026-09-03", "09:00"),
      status: "cancelled",
    });
    const details = await getAdminCustomerDetails(
      "phone:0501234567",
      jerusalem("2026-09-17", "10:00"),
    );
    expect(details?.nearestFutureScheduled).toBeNull();
    expect(details?.mostRecentlyCreated.id).toBe(newest.id);
    expect(details?.mostRecentlyCreated.status).toBe("cancelled");
  });

  it("protects both search and customer details", async () => {
    const store = memoryCookies();
    expect(await searchAdminCustomersAuthed(store, "דוד")).toEqual({
      ok: false,
      code: "unauthenticated",
    });
    expect(await getAdminCustomerDetailsAuthed(store, "phone:0501234567")).toEqual({
      ok: false,
      code: "unauthenticated",
    });

    await createSession(store);
    expect(await searchAdminCustomersAuthed(store, "דוד")).toEqual({ ok: true, suggestions: [] });
  });

  it("groups malformed legacy phones exactly and omits unsafe WhatsApp links", async () => {
    const service = await seedBase();
    await appointment({
      serviceId: service.id,
      name: "לקוח ישן",
      phone: "03-123-4567",
      startAt: jerusalem("2026-09-10", "10:00"),
      createdAt: jerusalem("2026-09-01", "09:00"),
    });
    const [suggestion] = await searchAdminCustomers("ישן");
    const details = await getAdminCustomerDetails(suggestion.identityKey);
    expect(details?.customerPhone).toBe("031234567");
    expect(details?.whatsappHref).toBeNull();
  });

  it("finds and safely displays an appointment without a phone as its own customer result", async () => {
    const service = await seedBase();
    const row = await appointment({
      serviceId: service.id,
      name: "לקוח ללא טלפון",
      phone: null,
      startAt: jerusalem("2026-09-20", "10:00"),
      createdAt: jerusalem("2026-09-03", "09:00"),
    });

    expect(await searchAdminCustomers("ללא")).toEqual([{
      identityKey: `appointment:${row.id}`,
      customerName: "לקוח ללא טלפון",
      customerPhone: null,
    }]);
    expect(await getAdminCustomerDetails(`appointment:${row.id}`)).toMatchObject({
      customerPhone: null,
      telHref: null,
      whatsappHref: null,
      mostRecentlyCreated: { id: row.id },
    });
  });
});
