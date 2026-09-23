"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  cancelAdminAppointmentAuthed,
  createAdminTimeBlockAuthed,
  createAdminWalkInAuthed,
  deleteAdminTimeBlockAuthed,
  getAdminDayAuthed,
  getAdminRescheduleSlotsAuthed,
  rescheduleAdminAppointmentAuthed,
} from "@/lib/adminDay";
import {
  getAdminCustomerDetailsAuthed,
  searchAdminCustomersAuthed,
} from "@/lib/adminAppointmentSearch";
import { attemptAdminLogin, clearSession } from "@/lib/adminSession";
import { isDemoMode } from "@/lib/demoMode";

export type LoginState = { error: string } | null;

export async function loginAdmin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const raw = formData.get("password");
  const password = typeof raw === "string" ? raw : "";
  const result = await attemptAdminLogin(password, await cookies());
  if (!result.ok) {
    return { error: result.error };
  }
  redirect("/admin");
}

export async function logoutAdmin() {
  await clearSession(await cookies());
  redirect(isDemoMode() ? "/admin" : "/admin/login");
}

export async function listDay(date?: string) {
  return getAdminDayAuthed(await cookies(), date);
}

export async function searchCustomers(query: string) {
  return searchAdminCustomersAuthed(await cookies(), query);
}

export async function getCustomerDetails(identityKey: string) {
  return getAdminCustomerDetailsAuthed(await cookies(), identityKey);
}

export async function cancelAppointment(id: string) {
  const result = await cancelAdminAppointmentAuthed(await cookies(), id);
  if (result.ok) {
    revalidatePath("/admin/day");
    revalidatePath("/admin");
  }
  return result;
}

export async function listRescheduleSlots(id: string, date: string) {
  return getAdminRescheduleSlotsAuthed(await cookies(), { id, date });
}

export async function rescheduleAppointment(id: string, startAtIso: string) {
  const result = await rescheduleAdminAppointmentAuthed(await cookies(), {
    id,
    startAt: startAtIso,
  });
  if (result.ok) {
    revalidatePath("/admin/day");
    revalidatePath("/admin");
  }
  return result;
}

export async function createWalkIn(input: {
  serviceId: string;
  startAtIso: string;
  customerName: string;
  customerPhone?: string | null;
  confirmedWithoutPhone?: boolean;
}) {
  const result = await createAdminWalkInAuthed(await cookies(), {
    serviceId: input.serviceId,
    startAt: input.startAtIso,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    confirmedWithoutPhone: input.confirmedWithoutPhone,
  });
  if (result.ok) {
    revalidatePath("/admin/day");
    revalidatePath("/admin");
  }
  return result;
}

export async function createBlock(input: {
  startAtIso: string;
  endAtIso: string;
  reason?: string;
}) {
  const result = await createAdminTimeBlockAuthed(await cookies(), {
    startAt: input.startAtIso,
    endAt: input.endAtIso,
    reason: input.reason,
  });
  if (result.ok) {
    revalidatePath("/admin/day");
    revalidatePath("/admin");
  }
  return result;
}

export async function deleteBlock(id: string, reopenFromIso?: string) {
  const result = await deleteAdminTimeBlockAuthed(await cookies(), id, undefined, reopenFromIso);
  if (result.ok) {
    revalidatePath("/admin/day");
    revalidatePath("/admin");
  }
  return result;
}
