import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createServiceAuthed,
  removeServiceAuthed,
  restoreServiceAuthed,
  saveServiceOrderAuthed,
  updateServiceAuthed,
  type ServiceInput,
} from "./adminServices";
import { createSession, type SessionCookieStore } from "./adminSession";
import { prisma } from "./prisma";
import { prepareTestDb, resetTestDb } from "@/test/resetTestDb";
import { DEMO_MAX_SERVICES } from "./demoMode";

function memoryCookies(): SessionCookieStore {
  const values = new Map<string, string>();
  return {
    get(name) {
      const value = values.get(name);
      return value === undefined ? undefined : { value };
    },
    set(name, value) {
      values.set(name, value);
    },
    delete(name) {
      values.delete(name);
    },
  };
}

async function authedCookies() {
  const store = memoryCookies();
  await createSession(store);
  return store;
}

const VALID_INPUT: ServiceInput = {
  name: "שירות",
  durationMinutes: "30",
  priceShekels: "80",
};

describe("authenticated service management", () => {
  beforeAll(prepareTestDb);
  beforeEach(resetTestDb);
  afterEach(resetTestDb);
  afterAll(async () => prisma.$disconnect());

  it("counts inactive services at the demo limit while allowing existing service changes", async () => {
    const previous = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "true";
    try {
      const store = await authedCookies();
      await prisma.settings.create({ data: { id: 1, businessName: "Test", providerName: "Test", phone: "0500000000", whatsappPhone: "972500000000" } });
      await prisma.service.createMany({ data: Array.from({ length: DEMO_MAX_SERVICES }, (_, index) =>
        ({ name: `Service ${index}`, durationMinutes: 30, sortOrder: index, active: index !== 0 }),
      ) });
      const rows = await prisma.service.findMany({ orderBy: { sortOrder: "asc" } });
      expect(await createServiceAuthed(store, VALID_INPUT)).toMatchObject({ ok: false, code: "demo_limit", error: expect.stringContaining("6") });
      expect(await restoreServiceAuthed(store, rows[0].id)).toMatchObject({ ok: true });
      expect(await updateServiceAuthed(store, rows[1].id, VALID_INPUT)).toMatchObject({ ok: true });
      expect(await removeServiceAuthed(store, rows[1].id)).toMatchObject({ ok: true });
      expect(await prisma.service.count()).toBe(DEMO_MAX_SERVICES);
    } finally {
      if (previous === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = previous;
    }
  });

  it("creates an active service after the highest existing sort order and converts shekels to agorot", async () => {
    await prisma.service.create({
      data: {
        name: "שירות קודם",
        durationMinutes: 20,
        priceAgorot: null,
        active: false,
        sortOrder: 7,
      },
    });

    const result = await createServiceAuthed(await authedCookies(), {
      name: "  שירות מורחב  ",
      durationMinutes: "45",
      priceShekels: "110.50",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.service).toMatchObject({
      name: "שירות מורחב",
      durationMinutes: 45,
      priceAgorot: 11_050,
      active: true,
      sortOrder: 8,
    });
  });

  it("edits service details and stores an empty optional price as null", async () => {
    const service = await prisma.service.create({
      data: { name: "שירות", durationMinutes: 30, priceAgorot: 8_000, sortOrder: 3 },
    });

    const result = await updateServiceAuthed(await authedCookies(), service.id, {
      name: "  שירות קצר ",
      durationMinutes: "25",
      priceShekels: "",
    });

    expect(result.ok).toBe(true);
    expect(await prisma.service.findUniqueOrThrow({ where: { id: service.id } })).toMatchObject({
      name: "שירות קצר",
      durationMinutes: 25,
      priceAgorot: null,
      sortOrder: 3,
    });
  });

  it("rejects editing a removed service without changing it", async () => {
    const service = await prisma.service.create({
      data: {
        name: "שירות שהוסר",
        durationMinutes: 30,
        priceAgorot: 8_000,
        active: false,
        sortOrder: 3,
      },
    });

    const result = await updateServiceAuthed(await authedCookies(), service.id, {
      name: "שם חדש",
      durationMinutes: "45",
      priceShekels: "100",
    });

    expect(result).toEqual({
      ok: false,
      code: "invalid",
      error: "לא ניתן לערוך שירות שהוסר.",
    });
    expect(await prisma.service.findUniqueOrThrow({ where: { id: service.id } })).toMatchObject({
      name: "שירות שהוסר",
      durationMinutes: 30,
      priceAgorot: 8_000,
      active: false,
    });
  });

  it("accepts comma decimals and a zero price without floating-point conversion", async () => {
    const store = await authedCookies();
    const decimal = await createServiceAuthed(store, {
      ...VALID_INPUT,
      priceShekels: "80,05",
    });
    const free = await createServiceAuthed(store, {
      ...VALID_INPUT,
      name: "ייעוץ",
      priceShekels: "0",
    });

    expect(decimal.ok && decimal.service).toMatchObject({ priceAgorot: 8_005, sortOrder: 1 });
    expect(free.ok && free.service).toMatchObject({ priceAgorot: 0, sortOrder: 2 });
  });

  it("soft-removes and restores the same service while preserving its appointment", async () => {
    const store = await authedCookies();
    const service = await prisma.service.create({
      data: { name: "שירות", durationMinutes: 30, priceAgorot: 8_000, sortOrder: 4 },
    });
    const appointment = await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: service.id,
        startAt: new Date("2026-09-20T07:00:00.000Z"),
        endAt: new Date("2026-09-20T07:30:00.000Z"),
      },
    });

    const removed = await removeServiceAuthed(store, service.id);

    expect(removed.ok).toBe(true);
    expect(await prisma.service.count()).toBe(1);
    expect(await prisma.service.findUniqueOrThrow({ where: { id: service.id } })).toMatchObject({
      id: service.id,
      active: false,
      sortOrder: 4,
    });
    expect(
      await prisma.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        include: { service: true },
      }),
    ).toMatchObject({ id: appointment.id, serviceId: service.id, service: { id: service.id } });

    const restored = await restoreServiceAuthed(store, service.id);

    expect(restored.ok).toBe(true);
    expect(await prisma.service.findUniqueOrThrow({ where: { id: service.id } })).toMatchObject({
      id: service.id,
      active: true,
      sortOrder: 4,
    });
  });

  it("persists a complete active-service order while keeping an inactive service in its restoration slot", async () => {
    const store = await authedCookies();
    const first = await prisma.service.create({
      data: { name: "ראשון", durationMinutes: 20, sortOrder: 10 },
    });
    const removed = await prisma.service.create({
      data: { name: "מוסר", durationMinutes: 25, sortOrder: 20, active: false },
    });
    const second = await prisma.service.create({
      data: { name: "שני", durationMinutes: 30, sortOrder: 30 },
    });
    const third = await prisma.service.create({
      data: { name: "שלישי", durationMinutes: 40, sortOrder: 40 },
    });
    const appointment = await prisma.appointment.create({
      data: {
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceId: second.id,
        startAt: new Date("2026-09-20T07:00:00.000Z"),
        endAt: new Date("2026-09-20T07:30:00.000Z"),
      },
    });

    expect(
      await saveServiceOrderAuthed(store, [third.id, first.id, second.id]),
    ).toEqual({ ok: true });
    expect(
      await prisma.service.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      }),
    ).toEqual([{ id: third.id }, { id: first.id }, { id: second.id }]);
    expect(await prisma.service.findUniqueOrThrow({ where: { id: removed.id } })).toMatchObject({
      active: false,
      sortOrder: 2,
    });
    expect(await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).toMatchObject({
      serviceId: second.id,
      status: "scheduled",
    });

    expect(await restoreServiceAuthed(store, removed.id)).toMatchObject({ ok: true });
    expect(
      await prisma.service.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      }),
    ).toEqual([{ id: third.id }, { id: removed.id }, { id: first.id }, { id: second.id }]);
  });

  it("rejects incomplete, duplicate, and stale active-service orders without writing", async () => {
    const store = await authedCookies();
    const first = await prisma.service.create({
      data: { name: "ראשון", durationMinutes: 20, sortOrder: 1 },
    });
    const second = await prisma.service.create({
      data: { name: "שני", durationMinutes: 30, sortOrder: 2 },
    });
    const removed = await prisma.service.create({
      data: { name: "מוסר", durationMinutes: 25, sortOrder: 3, active: false },
    });

    for (const order of [
      [first.id],
      [first.id, first.id],
      [first.id, removed.id],
      [first.id, "missing"],
    ]) {
      await expect(saveServiceOrderAuthed(store, order)).resolves.toMatchObject({
        ok: false,
        code: "invalid",
      });
    }

    expect(
      await prisma.service.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true } }),
    ).toEqual([{ id: first.id }, { id: second.id }, { id: removed.id }]);
  });

  it.each([
    [{ ...VALID_INPUT, name: "   " }, "name"],
    [{ ...VALID_INPUT, durationMinutes: "0" }, "durationMinutes"],
    [{ ...VALID_INPUT, durationMinutes: "12.5" }, "durationMinutes"],
    [{ ...VALID_INPUT, priceShekels: "-1" }, "priceShekels"],
    [{ ...VALID_INPUT, priceShekels: "12.345" }, "priceShekels"],
  ] as const)("rejects invalid service input without writing", async (input, field) => {
    const result = await createServiceAuthed(await authedCookies(), input);

    expect(result).toMatchObject({ ok: false, code: "invalid", field });
    expect(await prisma.service.count()).toBe(0);
  });

  it.each([
    [{ ...VALID_INPUT, name: 42 }, "name"],
    [{ ...VALID_INPUT, durationMinutes: null }, "durationMinutes"],
    [{ ...VALID_INPUT, priceShekels: { amount: 80 } }, "priceShekels"],
  ] as const)("rejects malformed non-string payload values without throwing", async (input, field) => {
    const result = await createServiceAuthed(
      await authedCookies(),
      input as unknown as ServiceInput,
    );

    expect(result).toMatchObject({ ok: false, code: "invalid", field });
    expect(await prisma.service.count()).toBe(0);
  });

  it("rejects unknown service ids", async () => {
    const store = await authedCookies();

    await expect(updateServiceAuthed(store, "missing", VALID_INPUT)).resolves.toMatchObject({
      ok: false,
      code: "not_found",
    });
    await expect(removeServiceAuthed(store, "missing")).resolves.toMatchObject({
      ok: false,
      code: "not_found",
    });
    await expect(restoreServiceAuthed(store, "missing")).resolves.toMatchObject({
      ok: false,
      code: "not_found",
    });
  });

  it("rejects every unauthenticated write before changing stored services", async () => {
    const store = memoryCookies();
    const active = await prisma.service.create({
      data: { name: "פעיל", durationMinutes: 30, priceAgorot: 8_000, sortOrder: 1 },
    });
    const inactive = await prisma.service.create({
      data: {
        name: "הוסר",
        durationMinutes: 20,
        priceAgorot: null,
        active: false,
        sortOrder: 2,
      },
    });

    const results = await Promise.all([
      createServiceAuthed(store, VALID_INPUT),
      updateServiceAuthed(store, active.id, { ...VALID_INPUT, name: "שונה" }),
      removeServiceAuthed(store, active.id),
      restoreServiceAuthed(store, inactive.id),
      saveServiceOrderAuthed(store, [active.id]),
    ]);

    expect(results).toEqual(
      results.map(() => ({
        ok: false,
        code: "unauthenticated",
        error: "אין הרשאה לבצע את הפעולה.",
      })),
    );
    expect(await prisma.service.findUniqueOrThrow({ where: { id: active.id } })).toMatchObject({
      name: "פעיל",
      active: true,
    });
    expect(await prisma.service.findUniqueOrThrow({ where: { id: inactive.id } })).toMatchObject({
      name: "הוסר",
      active: false,
    });
    expect(await prisma.service.count()).toBe(2);
  });
});
