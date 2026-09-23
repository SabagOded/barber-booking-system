import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminDayAuthed, isCalendarDate, shiftCalendarDate } from "@/lib/adminDay";
import { calendarDateInZone, lastBookableDate } from "@/lib/bookingWindow";
import { OfficeDesk } from "../_components/OfficeDesk";

export const metadata: Metadata = {
  title: "מערכת ניהול תורים",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const raw = (await searchParams).date;
  const requested = typeof raw === "string" && isCalendarDate(raw) ? raw : undefined;
  const now = new Date();
  const listed = await getAdminDayAuthed(await cookies(), requested, now);
  if (!listed.ok) {
    redirect("/admin/login");
  }

  const { day } = listed;
  const scheduledAppointmentCount = day.appointments.filter(
    (row) => row.status === "scheduled",
  ).length;
  const todayDate = calendarDateInZone(now, day.timeZone);

  return (
    <OfficeDesk
      date={day.date}
      todayDate={todayDate}
      lastBookableDate={lastBookableDate(now, day.timeZone)}
      currentTimeLabel={formatInTimeZone(now, day.timeZone, "HH:mm")}
      weekday={day.weekday}
      dateLabel={day.dateLabel}
      shopName={day.shopName}
      prevDate={shiftCalendarDate(day.date, -1)}
      nextDate={shiftCalendarDate(day.date, 1)}
      hours={day.hours}
      scheduledAppointmentCount={scheduledAppointmentCount}
      services={day.services}
      slots={day.slots}
      appointments={day.appointments.map((row) => ({
        id: row.id,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        serviceName: row.serviceName,
        startLabel: row.startLabel,
        endLabel: row.endLabel,
        status: row.status,
        canCancel: row.canCancel,
        canReschedule: row.canReschedule,
        startAtIso: row.startAt.toISOString(),
        endAtIso: row.endAt.toISOString(),
      }))}
      blocks={day.blocks.map((row) => ({
        id: row.id,
        startLabel: row.startLabel,
        endLabel: row.endLabel,
        reason: row.reason,
        past: row.past,
      }))}
    />
  );
}
