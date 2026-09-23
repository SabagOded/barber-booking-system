import { loadProtectedAdmin, type SessionCookieStore } from "./adminSession";
import { prisma } from "./prisma";
import { retryOnBusy } from "./booking";
import { DEMO_MAX_SERVICES, isDemoMode } from "./demoMode";

const INTEGER = /^\d+$/;
const PRICE = /^(\d+)(?:[.,](\d{1,2}))?$/;
const MAX_INT = 2_147_483_647;

export type ServiceInput = {
  name: string;
  durationMinutes: string;
  priceShekels: string;
};

export type AdminServiceRow = {
  id: string;
  name: string;
  durationMinutes: number;
  priceAgorot: number | null;
  active: boolean;
  sortOrder: number;
};

export type ServiceWriteResult =
  | { ok: true; service: AdminServiceRow }
  | ServiceWriteError;

type ServiceWriteError = {
  ok: false;
  code: "unauthenticated" | "invalid" | "not_found" | "demo_limit";
  error: string;
  field?: "name" | "durationMinutes" | "priceShekels";
};

export type ServiceOrderWriteResult = { ok: true } | ServiceWriteError;

type ValidServiceInput = {
  name: string;
  durationMinutes: number;
  priceAgorot: number | null;
};

async function gated<T>(
  store: SessionCookieStore,
  run: () => Promise<T>,
): Promise<T | ServiceWriteError> {
  const gate = await loadProtectedAdmin(store);
  if (!gate.ok) {
    return {
      ok: false,
      code: "unauthenticated",
      error: "אין הרשאה לבצע את הפעולה.",
    };
  }
  return run();
}

function validateServiceInput(
  input: unknown,
):
  | { ok: true; value: ValidServiceInput }
  | Exclude<ServiceWriteResult, { ok: true }> {
  const candidate = isRecord(input) ? input : {};
  if (typeof candidate.name !== "string") {
    return {
      ok: false,
      code: "invalid",
      field: "name",
      error: "נא להזין שם שירות.",
    };
  }
  const name = candidate.name.trim();
  if (!name) {
    return {
      ok: false,
      code: "invalid",
      field: "name",
      error: "נא להזין שם שירות.",
    };
  }

  if (typeof candidate.durationMinutes !== "string") {
    return {
      ok: false,
      code: "invalid",
      field: "durationMinutes",
      error: "משך השירות חייב להיות מספר שלם וחיובי.",
    };
  }
  const durationText = candidate.durationMinutes.trim();
  if (!INTEGER.test(durationText)) {
    return {
      ok: false,
      code: "invalid",
      field: "durationMinutes",
      error: "משך השירות חייב להיות מספר שלם וחיובי.",
    };
  }
  const durationMinutes = Number(durationText);
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > MAX_INT) {
    return {
      ok: false,
      code: "invalid",
      field: "durationMinutes",
      error: "משך השירות חייב להיות מספר שלם וחיובי.",
    };
  }

  if (typeof candidate.priceShekels !== "string") {
    return {
      ok: false,
      code: "invalid",
      field: "priceShekels",
      error: "נא להזין מחיר תקין עם עד שתי ספרות אחרי הנקודה.",
    };
  }
  const parsedPrice = parsePriceAgorot(candidate.priceShekels);
  if (!parsedPrice.ok) {
    return parsedPrice;
  }

  return {
    ok: true,
    value: { name, durationMinutes, priceAgorot: parsedPrice.priceAgorot },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePriceAgorot(
  value: string,
):
  | { ok: true; priceAgorot: number | null }
  | Exclude<ServiceWriteResult, { ok: true }> {
  const price = value.trim();
  if (!price) {
    return { ok: true, priceAgorot: null };
  }
  if (price.startsWith("-")) {
    return {
      ok: false,
      code: "invalid",
      field: "priceShekels",
      error: "המחיר לא יכול להיות שלילי.",
    };
  }

  const match = PRICE.exec(price);
  if (!match) {
    return {
      ok: false,
      code: "invalid",
      field: "priceShekels",
      error: "נא להזין מחיר תקין עם עד שתי ספרות אחרי הנקודה.",
    };
  }

  const shekels = Number(match[1]);
  const agorotPart = Number((match[2] ?? "").padEnd(2, "0"));
  const priceAgorot = shekels * 100 + agorotPart;
  if (!Number.isSafeInteger(priceAgorot) || priceAgorot > MAX_INT) {
    return {
      ok: false,
      code: "invalid",
      field: "priceShekels",
      error: "המחיר שהוזן גבוה מדי.",
    };
  }

  return { ok: true, priceAgorot };
}

export async function createServiceAuthed(
  store: SessionCookieStore,
  input: ServiceInput,
): Promise<ServiceWriteResult> {
  return gated(store, async (): Promise<ServiceWriteResult> => {
    const validated = validateServiceInput(input);
    if (!validated.ok) {
      return validated;
    }

    return retryOnBusy(() => prisma.$transaction(async (tx): Promise<ServiceWriteResult> => {
      if (isDemoMode()) {
        await tx.$executeRaw`UPDATE "Settings" SET "businessName" = "businessName" WHERE "id" = 1`;
        if (await tx.service.count() >= DEMO_MAX_SERVICES) {
          return { ok: false, code: "demo_limit", error: "הדמו הגיע למגבלה של 6 שירותים. אפשר לאפס את הדמו ולהמשיך." };
        }
      }
      const highest = await tx.service.aggregate({ _max: { sortOrder: true } });
      const service = await tx.service.create({
        data: {
          ...validated.value,
          active: true,
          sortOrder: (highest._max.sortOrder ?? 0) + 1,
        },
      });
      return { ok: true, service };
    }));
  });
}

export async function updateServiceAuthed(
  store: SessionCookieStore,
  id: string,
  input: ServiceInput,
): Promise<ServiceWriteResult> {
  return gated(store, async (): Promise<ServiceWriteResult> => {
    const serviceId = id.trim();
    const existing = serviceId
      ? await prisma.service.findUnique({ where: { id: serviceId } })
      : null;
    if (!existing) {
      return { ok: false, code: "not_found", error: "השירות לא נמצא." };
    }
    if (!existing.active) {
      return { ok: false, code: "invalid", error: "לא ניתן לערוך שירות שהוסר." };
    }

    const validated = validateServiceInput(input);
    if (!validated.ok) {
      return validated;
    }

    const service = await prisma.service.update({
      where: { id: serviceId },
      data: validated.value,
    });
    return { ok: true, service };
  });
}

export async function removeServiceAuthed(
  store: SessionCookieStore,
  id: string,
): Promise<ServiceWriteResult> {
  return setServiceActiveAuthed(store, id, false);
}

export async function restoreServiceAuthed(
  store: SessionCookieStore,
  id: string,
): Promise<ServiceWriteResult> {
  return setServiceActiveAuthed(store, id, true);
}

export async function saveServiceOrderAuthed(
  store: SessionCookieStore,
  orderedActiveIds: string[],
): Promise<ServiceOrderWriteResult> {
  return gated(store, async (): Promise<ServiceOrderWriteResult> => {
    if (
      !Array.isArray(orderedActiveIds) ||
      orderedActiveIds.some((id) => typeof id !== "string" || !id.trim()) ||
      new Set(orderedActiveIds).size !== orderedActiveIds.length
    ) {
      return invalidServiceOrder();
    }

    return prisma.$transaction(async (tx) => {
      const services = await tx.service.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
        select: { id: true, active: true },
      });
      const activeIds = services.filter((service) => service.active).map((service) => service.id);
      const submittedIds = new Set(orderedActiveIds);
      if (
        orderedActiveIds.length !== activeIds.length ||
        activeIds.some((id) => !submittedIds.has(id))
      ) {
        return invalidServiceOrder();
      }

      let activeIndex = 0;
      const reordered = services.map((service) =>
        service.active
          ? { id: orderedActiveIds[activeIndex++], active: true }
          : service,
      );

      for (const [index, service] of reordered.entries()) {
        await tx.service.update({
          where: { id: service.id },
          data: { sortOrder: index + 1 },
        });
      }

      return { ok: true };
    });
  });
}

async function setServiceActiveAuthed(
  store: SessionCookieStore,
  id: string,
  active: boolean,
): Promise<ServiceWriteResult> {
  return gated(store, async (): Promise<ServiceWriteResult> => {
    const serviceId = id.trim();
    const existing = serviceId
      ? await prisma.service.findUnique({ where: { id: serviceId } })
      : null;
    if (!existing) {
      return { ok: false, code: "not_found", error: "השירות לא נמצא." };
    }

    const service = await prisma.service.update({
      where: { id: serviceId },
      data: { active },
    });
    return { ok: true, service };
  });
}

function invalidServiceOrder(): ServiceWriteError {
  return {
    ok: false,
    code: "invalid",
    error: "רשימת השירותים השתנתה. רעננו את העמוד ונסו שוב.",
  };
}
