import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminDayAuthed } from "@/lib/adminDay";
import { getEffectiveHours } from "@/lib/shopHours";
import { TodayAppointments } from "./_components/TodayAppointments";
import { AdminAppointmentSearch } from "./_components/AdminAppointmentSearch";
import { AdminPageHeader } from "./_components/AdminPageHeader";

export const metadata: Metadata = {
  title: "מערכת ניהול תורים",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminPage() {
  const listed = await getAdminDayAuthed(await cookies());
  if (!listed.ok) {
    redirect("/admin/login");
  }

  const { day } = listed;
  const hours = await getEffectiveHours(day.date);
  const scheduled = day.appointments.filter((row) => row.status === "scheduled");
  const currentTimeLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: day.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const currentMinutes = clockMinutes(currentTimeLabel);
  const isOpenNow =
    hours.isOpen &&
    currentMinutes >= clockMinutes(hours.openTime) &&
    currentMinutes < clockMinutes(hours.closeTime);

  return (
    <main className="flex flex-1 flex-col gap-4 pb-8">
      <AdminPageHeader shopName={day.shopName} title="מערכת ניהול תורים" home sticky={false} />

      <section aria-labelledby="today-heading" className="admin-card-soft rounded-[22px] px-5 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="h-px flex-1 bg-brass/35" />
          <h2 id="today-heading" className="font-display text-center text-2xl font-bold text-cream">
            תורים שנקבעו להיום
          </h2>
          <span aria-hidden="true" className="h-px flex-1 bg-brass/35" />
        </div>
        <p className="mt-2 text-center text-base font-medium text-cream">{day.headline}</p>
        <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-sand">
          <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${isOpenNow ? "bg-ok" : "bg-danger"}`} />
          <span className={`font-semibold ${isOpenNow ? "text-ok" : "text-danger"}`}>
            {isOpenNow ? "פתוח" : "סגור"}
          </span>
          {hours.isOpen ? (
            <>
              <span aria-hidden="true" className="text-mute">·</span>
              <span>שעות פעילות היום: <span dir="ltr" className="tabular inline-block">{hours.openTime}-{hours.closeTime}</span></span>
            </>
          ) : "החנות סגורה היום"}
        </p>
        <p className="mt-1 text-center text-sm text-sand">{scheduled.length} תורים היום</p>
        <TodayAppointments
          appointments={scheduled.map((row) => ({
            id: row.id,
            startLabel: row.startLabel,
            customerName: row.customerName,
            serviceName: row.serviceName,
            customerPhone: row.customerPhone,
          }))}
        />
      </section>

      <section aria-labelledby="calendar-heading">
        <Link href="/admin/day" className="btn-primary group relative block overflow-hidden rounded-[22px] border border-brass-hi bg-brass px-5 py-5 text-ink shadow-[0_12px_30px_rgba(0,0,0,0.2)] hover:bg-brass-hi focus-visible:bg-brass-hi">
          <span aria-hidden="true" className="absolute -left-8 -top-12 h-36 w-36 rounded-full border border-ink/15" />
          <span className="relative flex items-center justify-between gap-4">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-3">
                <span aria-hidden="true" className="h-px flex-1 bg-ink/30" />
                <h2 id="calendar-heading" className="font-display text-center text-2xl font-bold">היומן שלי</h2>
                <span aria-hidden="true" className="h-px flex-1 bg-ink/30" />
              </span>
              <span className="mt-2 block text-sm">קביעת תור ידני · שינוי מועד · ביטול תור · חסימת שעות</span>
            </span>
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-ink/30 text-xl transition-transform group-hover:-translate-x-1">←</span>
          </span>
        </Link>
      </section>

      <AdminAppointmentSearch />

      <section aria-labelledby="edit-heading" className="admin-card-soft rounded-[22px] px-5 pb-3 pt-5">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="h-px flex-1 bg-brass/35" />
          <h2 id="edit-heading" className="font-display text-center text-2xl font-bold leading-snug text-cream">
            עריכת החנות
          </h2>
          <span aria-hidden="true" className="h-px flex-1 bg-brass/35" />
        </div>
        <p className="mt-2 text-center text-sm leading-relaxed text-sand">
          כאן מתאימים את העסק שלך למה שהלקוחות רואים ומזמינים.
        </p>
        <div className="mt-5 space-y-2">
          <Link href="/admin/hours" className="admin-row flex min-h-20 items-center justify-between gap-4 rounded-[14px] px-3 py-4 hover:border-brass/60 hover:bg-card-2 focus-visible:bg-card-2">
            <span>
              <span className="flex items-center gap-2.5">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-brass/30 bg-brass/[0.08] text-brass-hi">
                  <ManagementIcon kind="hours" />
                </span>
                <span className="block text-lg font-semibold text-cream">שעות פתיחה</span>
              </span>
              <span className="mt-1 block text-[15px] text-sand">שבוע רגיל + חריג ליום</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-lg text-brass">←</span>
          </Link>
          <Link href="/admin/shop" className="admin-row flex min-h-20 items-center justify-between gap-4 rounded-[14px] px-3 py-4 hover:border-brass/60 hover:bg-card-2 focus-visible:bg-card-2">
            <span>
              <span className="flex items-center gap-2.5">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-brass/30 bg-brass/[0.08] text-brass-hi">
                  <ManagementIcon kind="shop" />
                </span>
                <span className="block text-lg font-semibold text-cream">פרטי החנות</span>
              </span>
              <span className="mt-1 block text-[15px] text-sand">שם, כתובת, הודעה בדלת</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-lg text-brass">←</span>
          </Link>
          <Link href="/admin/media" className="admin-row flex min-h-20 items-center justify-between gap-4 rounded-[14px] px-3 py-4 hover:border-brass/60 hover:bg-card-2 focus-visible:bg-card-2">
            <span>
              <span className="flex items-center gap-2.5">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-brass/30 bg-brass/[0.08] text-brass-hi">
                  <ManagementIcon kind="media" />
                </span>
                <span className="block text-lg font-semibold text-cream">תמונות ומיתוג</span>
              </span>
              <span className="mt-1 block text-[15px] text-sand">לוגו + עבודות להצגה ללקוחות</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-lg text-brass">←</span>
          </Link>
          <Link href="/admin/services" className="admin-row flex min-h-20 items-center justify-between gap-4 rounded-[14px] px-3 py-4 hover:border-brass/60 hover:bg-card-2 focus-visible:bg-card-2">
            <span>
              <span className="flex items-center gap-2.5">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-brass/30 bg-brass/[0.08] text-brass-hi">
                  <ManagementIcon kind="services" />
                </span>
                <span className="block text-lg font-semibold text-cream">שירותים ומחירים</span>
              </span>
              <span className="mt-1 block text-[15px] text-sand">סוגי שירות, משך ומחיר</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-lg text-brass">←</span>
          </Link>
          <Link href="/admin/settings" className="admin-row flex min-h-20 items-center justify-between gap-4 rounded-[14px] px-3 py-4 hover:border-brass/60 hover:bg-card-2 focus-visible:bg-card-2">
            <span>
              <span className="flex items-center gap-2.5">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-brass/30 bg-brass/[0.08] text-brass-hi">
                  <ManagementIcon kind="settings" />
                </span>
                <span className="block text-lg font-semibold text-cream">הגדרות תורים</span>
              </span>
              <span className="mt-1 block text-[15px] text-sand">מרווח בין נקודות הזמן ביומן</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-lg text-brass">←</span>
          </Link>
        </div>
      </section>
    </main>
  );
}

function clockMinutes(label: string) {
  const [hours, minutes] = label.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}


function ManagementIcon({
  kind,
}: {
  kind: "hours" | "shop" | "media" | "services" | "settings";
}) {
  const common = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    className: "size-5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (kind === "hours") {
    return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
  }
  if (kind === "shop") {
    return <svg {...common}><path d="M4 10h16M6 10V5h12v5M6 10v9h12v-9M9 14h6" /></svg>;
  }
  if (kind === "media") {
    return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.5" /><path d="m6 17 4-4 3 3 2-2 3 3" /></svg>;
  }
  if (kind === "services") {
    return <svg {...common}><path d="m8 4 8 16M16 4 8 20" /><circle cx="7.2" cy="4.8" r="2.2" /><circle cx="16.8" cy="4.8" r="2.2" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></svg>;
}
