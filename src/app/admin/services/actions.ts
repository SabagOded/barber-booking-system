"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  createServiceAuthed,
  removeServiceAuthed,
  restoreServiceAuthed,
  saveServiceOrderAuthed,
  updateServiceAuthed,
  type ServiceOrderWriteResult,
  type ServiceInput,
  type ServiceWriteResult,
} from "@/lib/adminServices";

type FailedServiceAction = { ok: false; code: "failed"; error: string };

export type ServiceActionResult =
  | ServiceWriteResult
  | FailedServiceAction;

export type ServiceOrderActionResult = ServiceOrderWriteResult | FailedServiceAction;

function refreshServices() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/day");
  revalidatePath("/admin/services");
}

async function runServiceWrite<T extends ServiceWriteResult | ServiceOrderWriteResult>(
  action: () => Promise<T>,
): Promise<T | FailedServiceAction> {
  try {
    const result = await action();
    if (result.ok) {
      refreshServices();
    }
    return result;
  } catch {
    return {
      ok: false,
      code: "failed",
      error: "לא הצלחנו לשמור את השינוי. נסו שוב.",
    };
  }
}

export async function createService(input: ServiceInput) {
  return runServiceWrite(async () => createServiceAuthed(await cookies(), input));
}

export async function updateService(id: string, input: ServiceInput) {
  return runServiceWrite(async () => updateServiceAuthed(await cookies(), id, input));
}

export async function removeService(id: string) {
  return runServiceWrite(async () => removeServiceAuthed(await cookies(), id));
}

export async function restoreService(id: string) {
  return runServiceWrite(async () => restoreServiceAuthed(await cookies(), id));
}

export async function saveServiceOrder(orderedActiveIds: string[]) {
  return runServiceWrite(async () =>
    saveServiceOrderAuthed(await cookies(), orderedActiveIds),
  );
}
