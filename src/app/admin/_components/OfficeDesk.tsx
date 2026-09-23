"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { isFullName, MAX_CUSTOMER_NAME_LENGTH, normalizeIsraeliPhone } from "@/lib/customerFields";
import { formatHebrewCalendarDate } from "@/lib/dateDisplay";
import { buildWhatsAppRescheduleConfirmUrl, buildWhatsAppWalkInConfirmUrl } from "@/lib/whatsapp";
import { useDialogFocusTrap } from "@/app/_components/useDialogFocusTrap";
import { AdminPageHeader } from "./AdminPageHeader";
import {
  cancelAppointment,
  createBlock,
  createWalkIn,
  deleteBlock,
  listRescheduleSlots,
  rescheduleAppointment,
} from "../actions";

export type DeskAppointment = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  serviceName: string;
  startLabel: string;
  endLabel: string;
  status: "scheduled" | "cancelled" | "completed";
  canCancel: boolean;
  canReschedule: boolean;
  startAtIso: string;
  endAtIso: string;
};

export type DeskBlock = {
  id: string;
  startLabel: string;
  endLabel: string;
  reason: string | null;
  past: boolean;
  reopenFromIso?: string;
};

export type DeskSlot = {
  startLabel: string;
  endLabel: string;
  startAtIso: string;
  endAtIso: string;
  kind: "free" | "past" | "booked" | "blocked";
  past: boolean;
  appointmentId?: string;
  blockId?: string;
  reason?: string | null;
};

export type DeskService = {
  id: string;
  name: string;
  durationMinutes: number;
};

export function requiresMissingPhoneConfirmation(customerPhone: string): boolean {
  return customerPhone.trim().length === 0;
}

export function buildWalkInConfirmationHref(input: {
  customerPhone: string | null;
  customerName: string;
  weekday: string;
  dateLabel: string;
  timeLabel: string;
  serviceName: string;
}): string | null {
  if (!input.customerPhone) return null;
  return buildWhatsAppWalkInConfirmUrl({
    ...input,
    customerPhone: input.customerPhone,
  });
}

export function walkInFailureMessage(code: string): string {
  if (code === "slot_unavailable" || code === "service_unavailable") {
    return "השעה לא פנויה לשירות הזה";
  }
  if (code === "demo_limit") {
    return "הדמו הגיע למגבלת התורים. אפשר לאפס את הדמו ולהמשיך.";
  }
  if (code === "unauthenticated") {
    return "החיבור לאדמין פג. רעננו את הדף והתחברו מחדש.";
  }
  if (code === "phone_confirmation_required") {
    return "האישור לקביעת תור ללא טלפון לא התקבל. נסו לאשר שוב.";
  }
  return "לא הצלחנו לשמור את התור. נסו שוב.";
}

/** Historical days show only slots that contain recorded activity. */
export function visibleSlotsForDate(
  slots: DeskSlot[],
  selectedDate: string,
  todayDate: string,
): DeskSlot[] {
  if (selectedDate >= todayDate) {
    return slots;
  }
  return slots.filter((slot) => slot.kind === "booked" || slot.kind === "blocked");
}

type Overlay =
  | { kind: "appointment"; appointment: DeskAppointment }
  | { kind: "reschedule"; appointment: DeskAppointment }
  | { kind: "block"; block: DeskBlock }
  | { kind: "create"; slot: DeskSlot }
  | { kind: "help" };

type PendingCancel = {
  id: string;
  name: string;
  time: string;
};

const HOUR_GROUPS = [
  { id: "morning", label: "בוקר", match: (hour: number) => hour < 12 },
  { id: "afternoon", label: "צהריים", match: (hour: number) => hour >= 12 && hour < 17 },
  { id: "evening", label: "ערב", match: (hour: number) => hour >= 17 },
] as const;

const HELP_BLOCKS = [
  {
    icon: "create" as const,
    title: "איך קובעים תור",
    body: "לחצו על שעה פנויה, בחרו שירות והזינו את שם הלקוח. מספר טלפון מומלץ אך אינו חובה בתור ידני; בלעדיו לא ניתן לשלוח אישור בוואטסאפ או ליצור קשר דרך המערכת.",
  },
  {
    icon: "danger" as const,
    title: "איך מבטלים תור",
    body: "פתחו תור תפוס, ודאו את שם הלקוח ואת השעה, ואז בחרו \"ביטול התור\". אפשר לבטל רק תור שעוד לא התחיל.",
  },
  {
    icon: "block" as const,
    title: "איך חוסמים זמן",
    body: "כדי לחסום זמן ביומן, לחצו על שעה פנויה ובחרו \"חסום זמן\". בחרו את טווח השעות, ואם תרצו הוסיפו סיבה לחסימה.",
  },
  {
    icon: "appointment" as const,
    title: "יום אחר",
    body: "השתמשו ביום הקודם, ביום הבא או בבחירת התאריך שבראש היומן כדי לעבור ליום הרצוי.",
  },
] as const;

const DIALOG_CARD =
  "relative max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-line-strong bg-[linear-gradient(180deg,#2d2a25_0%,#25221e_34%,#1f1c19_100%)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_60px_rgba(0,0,0,0.48)] sm:rounded-[28px] sm:py-5";
const BTN_PRIMARY =
  "btn-primary flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-brass px-4 py-3 text-base font-bold text-ink shadow-[0_8px_22px_rgba(201,162,84,0.16)] hover:bg-brass-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-hi/70 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_CREATE =
  "btn-primary flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-ok px-4 py-3 text-base font-bold text-ink shadow-[0_8px_22px_rgba(143,191,138,0.2)] hover:bg-[#9ccb97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ok/80 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_WHATSAPP =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-[#55c56f]/70 bg-[#25D366]/14 px-4 py-3 text-base font-bold text-[#75df8d] shadow-[0_8px_22px_rgba(37,211,102,0.12)] hover:border-[#75df8d] hover:bg-[#25D366]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/45";
const BTN_RESCHEDULE =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-reschedule/65 bg-reschedule/15 px-4 py-3 text-base font-bold text-reschedule-hi hover:border-reschedule-hi hover:bg-reschedule/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-reschedule/50 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_MUTED =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-[#5a554e] bg-bg-2/50 px-4 py-3 text-base font-semibold text-cream hover:border-[#736c63] hover:bg-card-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand/40 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_SECONDARY =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-line-strong bg-bg-2/45 px-4 py-3 text-base font-semibold text-cream hover:border-brass/70 hover:bg-card-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/45 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_DANGER =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-danger/65 bg-danger/15 px-4 py-3 text-base font-bold text-danger hover:bg-danger/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50 disabled:cursor-not-allowed disabled:opacity-50";
const DIALOG_FIELD =
  "h-12 w-full rounded-[14px] border border-line-strong bg-bg-2 px-3 text-base text-cream outline-none placeholder:text-mute focus:border-brass focus:ring-1 focus:ring-brass/35 disabled:cursor-not-allowed disabled:opacity-50";

function NativeDateControl({
  value,
  onChange,
  ariaLabel,
  min,
  max,
  variant,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  min?: string;
  max?: string;
  variant: "day-nav" | "dialog";
}) {
  const isDialog = variant === "dialog";

  function openPicker(input: HTMLInputElement) {
    if (typeof input.showPicker !== "function") return;

    try {
      input.showPicker();
    } catch {
      input.focus({ preventScroll: true });
    }
  }

  return (
    <label
      className={`relative isolate block overflow-hidden focus-within:outline-none focus-within:ring-2 ${
        isDialog
          ? "h-12 rounded-[14px] border border-line-strong bg-bg-2 focus-within:border-reschedule focus-within:ring-reschedule/35"
          : "mt-0.5 h-8 rounded-[10px] border border-line bg-card-2 focus-within:border-brass focus-within:ring-brass/35"
      }`}
    >
      <span className="sr-only">{ariaLabel}</span>
      <span
        aria-hidden="true"
        dir="rtl"
        className={`pointer-events-none flex h-full min-w-0 items-center justify-center truncate px-2 text-center [unicode-bidi:isolate] ${
          isDialog ? "text-base font-medium text-cream" : "text-[11px] font-medium text-sand"
        }`}
      >
        {formatHebrewCalendarDate(value)}
      </span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        aria-label={ariaLabel}
        onClick={(event) => openPicker(event.currentTarget)}
        onChange={(event) => {
          if (event.target.value) {
            onChange(event.target.value);
          }
        }}
        className="pointer-events-auto absolute inset-0 z-20 block h-full w-full min-w-0 max-w-full cursor-pointer opacity-0"
        dir="ltr"
      />
    </label>
  );
}

export function OfficeDesk({
  date,
  todayDate,
  lastBookableDate,
  currentTimeLabel,
  weekday,
  dateLabel,
  shopName,
  prevDate,
  nextDate,
  hours,
  scheduledAppointmentCount,
  slots,
  appointments,
  blocks,
  services,
}: {
  date: string;
  todayDate: string;
  lastBookableDate: string;
  currentTimeLabel: string;
  weekday: string;
  dateLabel: string;
  shopName: string;
  prevDate: string;
  nextDate: string;
  hours:
  | { isOpen: false }
  | { isOpen: true; openTime: string; closeTime: string };
  scheduledAppointmentCount: number;
  slots: DeskSlot[];
  appointments: DeskAppointment[];
  blocks: DeskBlock[];
  services: DeskService[];
}) {
  const router = useRouter();
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [pendingCancel, setPendingCancel] = useState<PendingCancel | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  function closeOverlays() {
    setOverlay(null);
    setPendingCancel(null);
    setCancelError(null);
    setBlockError(null);
  }

  useDialogFocusTrap({
    open: Boolean(overlay || pendingCancel),
    dialogRef,
    onEscape: closeOverlays,
  });

  function openSlot(slot: DeskSlot) {
    if (slot.kind === "booked" && slot.appointmentId) {
      const appointment = appointments.find((row) => row.id === slot.appointmentId);
      if (appointment) {
        setOverlay({ kind: "appointment", appointment });
      }
      return;
    }
    if (slot.kind === "blocked" && slot.blockId) {
      const block = blocks.find((row) => row.id === slot.blockId) ?? {
        id: slot.blockId,
        startLabel: slot.startLabel,
        endLabel: slot.endLabel,
        reason: slot.reason ?? null,
        past: slot.past,
      };
      setOverlay({ kind: "block", block: { ...block, reopenFromIso: slot.startAtIso } });
      return;
    }
    if (slot.kind === "free") {
      setOverlay({ kind: "create", slot });
    }
  }

  function confirmCancel() {
    if (!pendingCancel) {
      return;
    }
    const id = pendingCancel.id;
    setCancelError(null);
    startTransition(async () => {
      try {
        const result = await cancelAppointment(id);
        if (result.ok) {
          closeOverlays();
          router.refresh();
          return;
        }
        setCancelError(
          result.code === "past"
            ? "אי אפשר לבטל תור שכבר התחיל."
            : "לא הצלחנו לבטל את התור. נסו שוב.",
        );
      } catch {
        setCancelError("לא הצלחנו לבטל את התור. נסו שוב.");
      }
    });
  }

  const showOverlay = overlay || pendingCancel;
  const appointmentsById = new Map(appointments.map((row) => [row.id, row]));
  const blocksById = new Map(blocks.map((row) => [row.id, row]));
  const visibleSlots = visibleSlotsForDate(slots, date, todayDate);
  const countLabel = appointmentCountLabel(scheduledAppointmentCount);
  const isToday = date === todayDate;
  const nowMarkerSlotId = isToday ? findNowMarkerSlotId(visibleSlots, currentTimeLabel, hours) : null;
  const dayStatus = getShopDayStatus(isToday, hours, currentTimeLabel);

  function scrollToNow() {
    document.getElementById("admin-day-now")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  return (
    <main className="-mx-5 -my-10 flex min-h-dvh flex-1 flex-col bg-[radial-gradient(circle_at_50%_-8%,rgba(201,162,84,0.075),transparent_34%),linear-gradient(180deg,#3a3630_0%,#332f2a_58%,#3a3630_100%)] px-5 pb-8 pt-10">
      <AdminPageHeader shopName={shopName} title="היומן שלי" sticky={false} />

      <div className="sticky top-0 z-10 -mx-5 bg-[#3a3630]/96 px-5 pb-3 pt-3 shadow-[0_14px_26px_rgba(0,0,0,0.28)] backdrop-blur-md">
        <nav
          aria-label="ניווט בין ימים"
          className="grid grid-cols-[minmax(0,1fr)_minmax(7.75rem,1.35fr)_minmax(0,1fr)] items-stretch gap-2"
        >
          <Link
            href={`/admin/day?date=${prevDate}`}
            className="flex min-w-0 flex-col items-center justify-center rounded-[16px] border border-line-strong bg-card/75 px-2 py-2.5 text-center text-xs font-semibold text-cream hover:bg-card-2 focus-visible:border-brass focus-visible:outline-none"
          >
            <span aria-hidden="true" className="text-base leading-none text-brass">→</span>
            <span className="mt-1">יום קודם</span>
          </Link>
          <div className="min-w-0 overflow-hidden rounded-[18px] border border-brass bg-card-2 px-2 py-1.5 text-center shadow-[0_8px_22px_rgba(0,0,0,0.18)]">
            <p className="truncate font-display text-lg font-bold text-brass-hi">
              {compactDayLabel(date, weekday)}
            </p>
            <NativeDateControl
              value={date}
              ariaLabel="בחירת תאריך מדויק"
              variant="day-nav"
              onChange={(value) => router.push(`/admin/day?date=${value}`)}
            />
          </div>
          <Link
            href={`/admin/day?date=${nextDate}`}
            className="flex min-w-0 flex-col items-center justify-center rounded-[16px] border border-line-strong bg-card/75 px-2 py-2.5 text-center text-xs font-semibold text-cream hover:bg-card-2 focus-visible:border-brass focus-visible:outline-none"
          >
            <span aria-hidden="true" className="text-base leading-none text-brass">←</span>
            <span className="mt-1">יום הבא</span>
          </Link>
        </nav>

        <section
          aria-label="סיכום היום"
          className="mt-2.5 flex min-h-14 flex-col items-center justify-center gap-2.5 rounded-[16px] border border-line-strong bg-card/95 px-3 py-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.16)]"
        >
          <div className="flex min-w-0 items-center justify-center gap-2.5 text-center">
            {dayStatus.indicatorColor ? (
              <span
                aria-hidden="true"
                className={`size-2.5 shrink-0 rounded-full ${dayStatus.indicatorColor === "ok" ? "bg-ok" : "bg-danger"
                  }`}
              />
            ) : null}
            <p className="min-w-0 text-sm font-medium leading-relaxed text-cream">
              {dayStatus.statusLabel ? <span>{dayStatus.statusLabel}</span> : null}
              {dayStatus.statusLabel && dayStatus.hoursRange ? (
                <span aria-hidden="true" className="mx-1.5 text-mute">·</span>
              ) : null}
              {dayStatus.hoursRange ? (
                <span dir="ltr" className="tabular inline-block">
                  {dayStatus.hoursRange}
                </span>
              ) : null}
              <span aria-hidden="true" className="mx-1.5 text-mute">·</span>
              <span>{countLabel}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {date !== todayDate ? (
              <Link
                href={`/admin/day?date=${todayDate}`}
                className="flex min-h-10 items-center justify-center rounded-full border border-line-strong px-4 text-sm font-medium text-brass-hi hover:bg-card-2 focus-visible:border-brass focus-visible:outline-none"
              >
                חזרה להיום
              </Link>
            ) : null}
            {isToday && nowMarkerSlotId ? (
              <button
                type="button"
                onClick={scrollToNow}
                className="flex min-h-10 items-center justify-center rounded-full border border-ok/55 bg-ok/10 px-3 text-xs font-semibold text-ok hover:bg-ok/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ok"
              >
                עבור לעכשיו
              </button>
            ) : null}
            <button
              type="button"
              aria-label="פתיחת הסבר על היומן"
              aria-haspopup="dialog"
              onClick={() => setOverlay({ kind: "help" })}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-line-strong px-3 text-sm font-semibold text-brass-hi hover:bg-card-2 focus-visible:border-brass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/40"
            >
              <InfoIcon />
              <span>הסבר</span>
            </button>
          </div>
        </section>
      </div>

      {visibleSlots.length === 0 ? (
        <p className="mt-8 text-center text-sand">
          {date < todayDate ? "לא הייתה פעילות ביומן ביום הזה." : "אין תורים ביום הזה."}
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {HOUR_GROUPS.map((group) => {
            const groupSlots = visibleSlots.filter((slot) =>
              group.match(Number(slot.startLabel.slice(0, 2))),
            );
            if (groupSlots.length === 0) {
              return null;
            }
            return (
              <section key={group.id} aria-labelledby={`${group.id}-heading`}>
                <div className="mb-3 flex items-center gap-3">
                  <h2
                    id={`${group.id}-heading`}
                    className="font-display flex shrink-0 items-center gap-2 text-2xl font-bold text-cream"
                  >
                    {group.label}
                    <DayPartIcon evening={group.id === "evening"} />
                  </h2>
                  <span aria-hidden="true" className="h-px flex-1 bg-line-strong" />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {groupSlots.map((slot) => (
                    <Fragment key={slot.startAtIso}>
                      {slot.startAtIso === nowMarkerSlotId ? <NowMarker /> : null}
                      <HourButton
                        slot={slot}
                        appointment={
                          slot.appointmentId
                            ? appointmentsById.get(slot.appointmentId)
                            : undefined
                        }
                        block={slot.blockId ? blocksById.get(slot.blockId) : undefined}
                        onOpen={() => openSlot(slot)}
                      />
                    </Fragment>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showOverlay ? (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-[#090705]/80 p-0 backdrop-blur-[3px] sm:items-center sm:p-3"
          role="presentation"
          onClick={closeOverlays}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={dialogLabel(overlay, pendingCancel)}
            className={`${DIALOG_CARD} ${pendingCancel
                ? "border-danger/65 bg-[linear-gradient(180deg,#3b2b27_0%,#302521_38%,#292522_100%)]"
                : overlay?.kind === "appointment" && !overlay.appointment.canCancel
                  ? "!border-[#5a554e]"
                  : ""
              }`}
            onClick={(event) => event.stopPropagation()}
          >
            <span
              aria-hidden="true"
              className={`mx-auto mb-3 block h-1 w-12 rounded-full ${overlay?.kind === "appointment" && !overlay.appointment.canCancel
                  ? "bg-[#5a554e]"
                  : "bg-line-strong"
                } sm:hidden`}
            />
            {pendingCancel ? (
              <>
                <SheetHeader
                  icon="danger"
                  eyebrow="פעולה בלתי הפיכה"
                  title="לבטל את התור?"
                  onClose={closeOverlays}
                  danger
                />
                <div className="mt-5 rounded-[18px] border border-danger/35 bg-danger/[0.08] p-4 text-center">
                  <p className="text-sm text-sand">התור של</p>
                  <p className="mt-1 text-lg font-bold text-cream">{pendingCancel.name}</p>
                  <p className="font-display tabular mt-1 text-2xl font-bold text-danger" dir="ltr">
                    {pendingCancel.time}
                  </p>
                </div>
                <p className="mt-3 text-center text-sm leading-relaxed text-sand">
                  השעה תחזור להיות פנויה להזמנה.
                </p>
                {cancelError ? (
                  <p role="alert" className="mt-3 rounded-[12px] border border-danger/40 bg-danger/10 px-3 py-2 text-center text-sm text-danger">
                    {cancelError}
                  </p>
                ) : null}
                <button type="button" disabled={isPending} onClick={confirmCancel} className={`${BTN_DANGER} mt-5`}>
                  <DialogIcon kind="delete" />
                  {isPending ? "מבטל..." : "כן, לבטל את התור"}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setCancelError(null);
                    setPendingCancel(null);
                  }}
                  className={`${BTN_SECONDARY} mt-2`}
                >
                  לא, לחזור לפרטי התור
                </button>
              </>
            ) : overlay?.kind === "help" ? (
              <HelpSheet onClose={closeOverlays} />
            ) : overlay?.kind === "appointment" ? (
              <TicketSheet
                appointment={overlay.appointment}
                weekday={weekday}
                dateLabel={dateLabel}
                onClose={closeOverlays}
                onReschedule={() =>
                  setOverlay({ kind: "reschedule", appointment: overlay.appointment })
                }
                onCancel={() =>
                  setPendingCancel({
                    id: overlay.appointment.id,
                    name: overlay.appointment.customerName,
                    time: overlay.appointment.startLabel,
                  })
                }
              />
            ) : overlay?.kind === "reschedule" ? (
              <RescheduleSheet
                appointment={overlay.appointment}
                currentDate={date}
                oldWeekday={weekday}
                oldDateLabel={dateLabel}
                todayDate={todayDate}
                lastBookableDate={lastBookableDate}
                onClose={closeOverlays}
                onBack={() => setOverlay({ kind: "appointment", appointment: overlay.appointment })}
                onWrote={() => router.refresh()}
              />
            ) : overlay?.kind === "block" ? (
              <BlockSheet
                block={overlay.block}
                weekday={weekday}
                dateLabel={dateLabel}
                pending={isPending}
                onClose={closeOverlays}
                onRemove={() => {
                  setBlockError(null);
                  startTransition(async () => {
                    try {
                      const result = await deleteBlock(overlay.block.id, overlay.block.reopenFromIso);
                      if (result.ok) {
                        closeOverlays();
                        router.refresh();
                        return;
                      }
                      setBlockError(
                        result.code === "past"
                          ? "אי אפשר לפתוח מחדש זמן שכבר עבר."
                          : "לא הצלחנו להסיר את החסימה. נסו שוב.",
                      );
                    } catch {
                      setBlockError("לא הצלחנו להסיר את החסימה. נסו שוב.");
                    }
                  });
                }}
                error={blockError}
              />
            ) : overlay?.kind === "create" ? (
              <CreateSheet
                key={overlay.slot.startAtIso}
                slot={overlay.slot}
                slots={slots}
                services={services}
                weekday={weekday}
                dateLabel={dateLabel}
                onClose={closeOverlays}
                onWrote={() => router.refresh()}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function HourButton({
  slot,
  appointment,
  block,
  onOpen,
}: {
  slot: DeskSlot;
  appointment?: DeskAppointment;
  block?: DeskBlock;
  onOpen: () => void;
}) {
  const tappable = slot.kind === "booked" || slot.kind === "blocked" || slot.kind === "free";
  const look = chipLook(slot);
  const blockReason = block?.reason?.trim() || slot.reason?.trim() || "זמן חסום";
  const showAppointment = slot.kind === "booked" && appointment;

  return (
    <button
      type="button"
      disabled={!tappable}
      style={
        slot.past
          ? {
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(183, 167, 141, 0.065) 0, rgba(183, 167, 141, 0.065) 1px, transparent 1px, transparent 8px)",
          }
          : undefined
      }
      onClick={() => {
        if (tappable) {
          onOpen();
        }
      }}
      className={`group flex min-h-[7.25rem] w-full flex-col rounded-[16px] px-3 py-3 text-right shadow-[0_9px_20px_rgba(0,0,0,0.13)] focus-visible:border-brass focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass ${look.chip} ${tappable
          ? "hover:brightness-110 active:translate-y-px active:brightness-110"
          : "cursor-default"
        }`}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className={`font-display tabular text-2xl font-bold leading-none ${look.time}`} dir="ltr">
          {slot.startLabel}
        </span>
        <span className={`flex shrink-0 items-center gap-1.5 text-sm font-semibold ${look.status}`}>
          <span className={`size-2.5 shrink-0 rounded-full ${look.dot}`} aria-hidden="true" />
          {look.label}
        </span>
      </span>

      {showAppointment ? (
        <span className="mt-3 flex w-full min-w-0 flex-1 items-end justify-between gap-2">
          <span className="min-w-0 self-start">
            <span className={`block truncate text-base font-semibold leading-snug ${look.detail}`}>
              {appointment.customerName}
            </span>
            <span className={`mt-1 block truncate text-sm leading-snug ${look.secondary}`}>
              {appointment.serviceName}
            </span>
          </span>
          <SlotGraphic kind="person" muted={slot.past} />
        </span>
      ) : slot.kind === "blocked" ? (
        <span className="mt-3 flex w-full min-w-0 flex-1 items-end justify-between gap-2">
          <span className={`min-w-0 self-start text-sm leading-snug ${look.secondary}`}>
            {blockReason}
          </span>
          <SlotGraphic kind="blocked" />
        </span>
      ) : null}
    </button>
  );
}

function chipLook(slot: DeskSlot): {
  chip: string;
  time: string;
  status: string;
  dot: string;
  detail: string;
  secondary: string;
  label: string;
} {
  if (slot.kind === "booked" && !slot.past) {
    return {
      chip: "border border-danger/70 bg-[#351f1d]",
      time: "text-cream",
      status: "text-danger",
      dot: "bg-danger",
      detail: "text-cream",
      secondary: "text-sand",
      label: "תפוס",
    };
  }
  if (slot.kind === "booked" && slot.past) {
    return {
      chip: "border border-[#625b52] bg-[#28241f]",
      time: "text-sand line-through",
      status: "text-sand",
      dot: "bg-mute",
      detail: "text-sand",
      secondary: "text-mute",
      label: "עבר",
    };
  }
  if (slot.past) {
    return {
      chip: "border border-[#5a554e] bg-[#24221e] shadow-none",
      time: "text-sand line-through",
      status: "text-mute",
      dot: "bg-mute",
      detail: "text-sand",
      secondary: "text-mute",
      label: "עבר",
    };
  }
  if (slot.kind === "blocked") {
    return {
      chip: "border border-brass/65 bg-[#352a1c]",
      time: "text-brass-hi",
      status: "text-brass-hi",
      dot: "bg-brass",
      detail: "text-cream",
      secondary: "text-sand",
      label: "חסום",
    };
  }
  return {
    chip: "border border-ok/80 bg-[#1b3025] shadow-[0_5px_18px_rgba(143,191,138,0.14)] hover:border-ok-hi hover:bg-[#22402f]",
    time: "text-cream",
    status: "text-ok",
    dot: "bg-ok",
    detail: "text-cream",
    secondary: "text-sand",
    label: "פנוי",
  };
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    >
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v4" />
      <path d="M10 6.2h.01" />
    </svg>
  );
}

function NowMarker() {
  return (
    <div
      id="admin-day-now"
      aria-label="השעה הנוכחית"
      className="col-span-2 flex scroll-mt-56 items-center gap-2 py-1"
    >
      <span aria-hidden="true" className="h-px flex-1 bg-ok/60" />
      <span className="rounded-full border border-ok/55 bg-[#1c2a20] px-3 py-1 text-xs font-bold text-ok shadow-[0_0_18px_rgba(143,191,138,0.12)]">
        עכשיו
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-ok/60" />
    </div>
  );
}

export type ShopDayHours =
  | { isOpen: false }
  | { isOpen: true; openTime: string; closeTime: string };

export type ShopDayStatus = {
  isToday: boolean;
  isOpenNow: boolean;
  statusLabel: string | null;
  hoursRange: string | null;
  indicatorColor: "ok" | "danger" | null;
};

export function clockMinutes(label: string): number {
  const [hours, minutes] = label.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function getShopDayStatus(
  isToday: boolean,
  hours: ShopDayHours,
  currentTimeLabel: string,
): ShopDayStatus {
  const range = hours.isOpen ? `${hours.openTime}–${hours.closeTime}` : null;

  if (!isToday) {
    if (!hours.isOpen) {
      return {
        isToday: false,
        isOpenNow: false,
        statusLabel: "סגור",
        hoursRange: null,
        indicatorColor: null,
      };
    }
    return {
      isToday: false,
      isOpenNow: false,
      statusLabel: null,
      hoursRange: range,
      indicatorColor: null,
    };
  }

  if (!hours.isOpen) {
    return {
      isToday: true,
      isOpenNow: false,
      statusLabel: "סגור",
      hoursRange: null,
      indicatorColor: "danger",
    };
  }

  const currentMinutes = clockMinutes(currentTimeLabel);
  const openMinutes = clockMinutes(hours.openTime);
  const closeMinutes = clockMinutes(hours.closeTime);
  const isOpenNow = currentMinutes >= openMinutes && currentMinutes < closeMinutes;

  return {
    isToday: true,
    isOpenNow,
    statusLabel: isOpenNow ? "פתוח" : "סגור",
    hoursRange: range,
    indicatorColor: isOpenNow ? "ok" : "danger",
  };
}

export function findNowMarkerSlotId(
  slots: DeskSlot[],
  currentTimeLabel: string,
  hours?: ShopDayHours,
): string | null {
  if (slots.length === 0) {
    return null;
  }

  const currentMinutes = clockMinutes(currentTimeLabel);

  if (hours) {
    if (!hours.isOpen) {
      return null;
    }
    const openMinutes = clockMinutes(hours.openTime);
    const closeMinutes = clockMinutes(hours.closeTime);
    if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
      return null;
    }
  } else if (slots.length > 0) {
    const openMinutes = clockMinutes(slots[0]!.startLabel);
    const closeMinutes = clockMinutes(slots[slots.length - 1]!.endLabel);
    if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
      return null;
    }
  }

  const nextSlot =
    slots.find((slot) => clockMinutes(slot.startLabel) >= currentMinutes) ?? slots.at(-1);
  if (!nextSlot) {
    return null;
  }

  const hour = Number(nextSlot.startLabel.slice(0, 2));
  const group = HOUR_GROUPS.find((candidate) => candidate.match(hour));
  const groupSlots = group
    ? slots.filter((slot) => group.match(Number(slot.startLabel.slice(0, 2))))
    : slots;
  const slotIndex = Math.max(0, groupSlots.findIndex((slot) => slot.startAtIso === nextSlot.startAtIso));
  return groupSlots[Math.floor(slotIndex / 2) * 2]?.startAtIso ?? nextSlot.startAtIso;
}

function DayPartIcon({ evening }: { evening: boolean }) {
  return evening ? (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 text-brass-hi"
      fill="currentColor"
    >
      <path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.7 8.7 0 1 0 20.2 15.2Z" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 text-brass-hi"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </svg>
  );
}

function SlotGraphic({
  kind,
  muted = false,
}: {
  kind: "person" | "blocked";
  muted?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-9 shrink-0 items-center justify-center rounded-full border ${muted
          ? "border-[#625b52] bg-[#2d2a25] text-sand"
          : kind === "person"
            ? "border-danger/60 bg-danger/10 text-cream"
            : "border-brass/60 bg-brass/10 text-brass-hi"
        }`}
    >
      {kind === "person" ? (
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
          <circle cx="12" cy="8" r="3.25" />
          <path d="M6.5 19c.2-3.4 2.1-5.5 5.5-5.5s5.3 2.1 5.5 5.5H6.5Z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="12" cy="12" r="7.5" />
          <path d="m7 17 10-10" />
        </svg>
      )}
    </span>
  );
}

function compactDayLabel(date: string, weekday: string): string {
  const [, month, day] = date.split("-").map(Number);
  const weekdayLetters: Record<string, string> = {
    "יום ראשון": "א׳",
    ראשון: "א׳",
    "יום שני": "ב׳",
    שני: "ב׳",
    "יום שלישי": "ג׳",
    שלישי: "ג׳",
    "יום רביעי": "ד׳",
    רביעי: "ד׳",
    "יום חמישי": "ה׳",
    חמישי: "ה׳",
    "יום שישי": "ו׳",
    שישי: "ו׳",
    "יום שבת": "ש׳",
    שבת: "ש׳",
  };
  const shortWeekday = weekdayLetters[weekday] ?? weekday;
  return `${weekdayLetters[weekday] ? `יום ${shortWeekday}` : shortWeekday} · ${day}.${month}`;
}

function appointmentCountLabel(count: number): string {
  return count === 1 ? "תור אחד" : `${count} תורים`;
}

function TicketSummary({
  weekday,
  dateLabel,
  time,
  tone = "brass",
}: {
  weekday: string;
  dateLabel: string;
  time: string;
  tone?: "brass" | "danger" | "ok" | "muted";
}) {
  const isDanger = tone === "danger";
  const isAvailable = tone === "ok";
  const isMuted = tone === "muted";
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border px-4 py-3.5 ${isDanger
        ? "border-danger/45 bg-danger/[0.08]"
        : isAvailable
          ? "border-ok/50 bg-ok/[0.075]"
          : isMuted
            ? "border-[#5a554e] bg-[#28241f]/85"
            : "border-brass/50 bg-brass/[0.08]"
      }`}>
      <div className="min-w-0 text-right">
        <p className="font-display text-lg font-bold leading-tight text-cream">{weekday}</p>
        <p className="mt-1 truncate text-sm text-sand">{dateLabel}</p>
      </div>
      <div className={`border-r pr-3 text-left ${isDanger
          ? "border-danger/35"
          : isAvailable
            ? "border-ok/35"
            : isMuted
              ? "border-[#5a554e]/60"
              : "border-brass/35"
        }`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">שעה</p>
        <p className={`font-display tabular mt-0.5 whitespace-nowrap text-xl font-bold ${isDanger ? "text-danger" : isAvailable ? "text-ok" : isMuted ? "text-sand" : "text-brass-hi"
          }`} dir="ltr">
          {time}
        </p>
      </div>
    </div>
  );
}

function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <>
      <SheetHeader
        icon="help"
        eyebrow="מדריך קצר"
        title="איך עובדים עם היומן"
        onClose={onClose}
      />
      <div className="mt-5 space-y-2.5 text-right">
        {HELP_BLOCKS.map((block, index) => (
          <div key={block.title} className="flex gap-3 rounded-[16px] border border-line bg-bg-2/55 p-3.5">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-brass/45 bg-brass/10 text-brass-hi">
              <DialogIcon kind={block.icon} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-[11px] font-bold text-sand">
                  {index + 1}
                </span>
                <h2 className="font-display text-base font-bold text-cream">{block.title}</h2>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-sand">{block.body}</p>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={onClose} className={`${BTN_SECONDARY} mt-4`}>
        סגור
      </button>
    </>
  );
}

function TicketSheet({
  appointment,
  weekday,
  dateLabel,
  onClose,
  onReschedule,
  onCancel,
}: {
  appointment: DeskAppointment;
  weekday: string;
  dateLabel: string;
  onClose: () => void;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  const isPast = !appointment.canCancel;
  return (
    <>
      <SheetHeader
        icon="appointment"
        eyebrow={isPast ? "תור שהסתיים" : "תור תפוס"}
        title="פרטי התור"
        onClose={onClose}
        danger={appointment.canCancel}
        muted={isPast}
      />
      <div className="mt-5">
        <TicketSummary
          weekday={weekday}
          dateLabel={dateLabel}
          time={`${appointment.startLabel}–${appointment.endLabel}`}
          tone={appointment.canCancel ? "danger" : "muted"}
        />
      </div>
      <div className={`mt-3 rounded-[18px] border ${isPast ? "border-[#5a554e]/70" : "border-line"} bg-card-2/60 p-4`}>
        <DetailRow icon="person" label="לקוח" value={appointment.customerName} tone={isPast ? "muted" : "brass"} />
        <div className={`my-3 h-px ${isPast ? "bg-[#5a554e]/40" : "bg-line"}`} />
        <DetailRow icon="service" label="שירות" value={appointment.serviceName} tone={isPast ? "muted" : "brass"} />
      </div>
      {appointment.customerPhone ? (
        <a
          href={`tel:${appointment.customerPhone}`}
          className={`${isPast ? BTN_MUTED : BTN_SECONDARY} mt-3`}
          dir="ltr"
        >
          <DialogIcon kind="phone" />
          <span className="tabular">{appointment.customerPhone}</span>
        </a>
      ) : (
        <p className={`${isPast ? BTN_MUTED : BTN_SECONDARY} mt-3`}>
          <DialogIcon kind="phone" />
          ללא טלפון
        </p>
      )}
      {canRescheduleAppointment(appointment) ? (
        <button type="button" onClick={onReschedule} className={`${BTN_RESCHEDULE} mt-3`}>
          <DialogIcon kind="reschedule" />
          שינוי מועד
        </button>
      ) : null}
      {appointment.canCancel ? (
        <button type="button" onClick={onCancel} className={`${BTN_DANGER} mt-3`}>
          <DialogIcon kind="delete" />
          ביטול התור
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        className={`${isPast ? BTN_MUTED : BTN_SECONDARY} mt-2`}
      >
        סגור
      </button>
    </>
  );
}

type RescheduleSlot = {
  startAtIso: string;
  endAtIso: string;
  startLabel: string;
  endLabel: string;
};

export type RescheduleStep = "choose" | "confirm" | "success";
export type RescheduleEvent = "continue" | "back" | "saved" | "rejected";

export function nextRescheduleStep(
  step: RescheduleStep,
  event: RescheduleEvent,
): RescheduleStep {
  if (event === "saved" && step === "confirm") return "success";
  if ((event === "back" || event === "rejected") && step === "confirm") return "choose";
  if (event === "continue" && step === "choose") return "confirm";
  return step;
}

function RescheduleSheet({
  appointment,
  currentDate,
  oldWeekday,
  oldDateLabel,
  todayDate,
  lastBookableDate,
  onClose,
  onBack,
  onWrote,
}: {
  appointment: DeskAppointment;
  currentDate: string;
  oldWeekday: string;
  oldDateLabel: string;
  todayDate: string;
  lastBookableDate: string;
  onClose: () => void;
  onBack: () => void;
  onWrote: () => void;
}) {
  const [date, setDate] = useState(currentDate);
  const [dateInfo, setDateInfo] = useState({ weekday: oldWeekday, dateLabel: oldDateLabel });
  const [slots, setSlots] = useState<RescheduleSlot[]>([]);
  const [selectedIso, setSelectedIso] = useState("");
  const [step, setStep] = useState<RescheduleStep>("choose");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    listRescheduleSlots(appointment.id, date)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setSlots([]);
          setError(rescheduleError(result.code));
          return;
        }
        setDateInfo({ weekday: result.weekday, dateLabel: result.dateLabel });
        setSlots(result.slots);
        const current = result.slots.find((slot) => slot.startAtIso === appointment.startAtIso);
        setSelectedIso(current?.startAtIso ?? "");
      })
      .catch(() => {
        if (active) setError("לא הצלחנו לטעון שעות פנויות. נסו שוב.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appointment.id, appointment.startAtIso, date]);

  const selected = slots.find((slot) => slot.startAtIso === selectedIso);

  function save() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await rescheduleAppointment(appointment.id, selected.startAtIso);
        if (!result.ok) {
          setError(rescheduleError(result.code));
          setStep((current) => nextRescheduleStep(current, "rejected"));
          const refreshed = await listRescheduleSlots(appointment.id, date);
          if (refreshed.ok) setSlots(refreshed.slots);
          return;
        }
        setStep((current) => nextRescheduleStep(current, "saved"));
        onWrote();
      } catch {
        setError("לא הצלחנו לשנות את מועד התור. נסו שוב.");
        setStep((current) => nextRescheduleStep(current, "rejected"));
      }
    });
  }

  if (step === "success" && selected) {
    return (
      <>
        <SheetHeader icon="success" eyebrow="הפעולה הושלמה" title="המועד שונה" onClose={onClose} success />
        <div className="mt-5">
          <TicketSummary
            weekday={dateInfo.weekday}
            dateLabel={dateInfo.dateLabel}
            time={`${selected.startLabel}–${selected.endLabel}`}
            tone="ok"
          />
        </div>
        {appointment.customerPhone ? (
          <a
            href={buildWhatsAppRescheduleConfirmUrl({
              customerPhone: appointment.customerPhone,
              customerName: appointment.customerName,
              weekday: dateInfo.weekday,
              dateLabel: dateInfo.dateLabel,
              timeLabel: selected.startLabel,
              serviceName: appointment.serviceName,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BTN_WHATSAPP} mt-4`}
          >
            <DialogIcon kind="whatsapp" />
            שליחת עדכון בוואטסאפ
          </a>
        ) : null}
        <button type="button" onClick={onClose} className={`${BTN_SECONDARY} mt-2`}>סגור</button>
      </>
    );
  }

  if (step === "confirm" && selected) {
    return (
      <>
        <SheetHeader icon="reschedule" eyebrow="אישור שינוי" title="לשנות את המועד?" onClose={onClose} reschedule />
        <div className="mt-5 space-y-2">
          <div className="rounded-[18px] border border-reschedule/25 bg-reschedule/[0.04] p-3.5">
            <p className="text-xs font-semibold text-sand/80">התור המקורי</p>
            <p className="mt-1 text-sm text-sand">{oldWeekday}, {oldDateLabel}</p>
            <p className="font-display tabular mt-0.5 text-xl font-bold text-cream/90" dir="ltr">
              {appointment.startLabel}–{appointment.endLabel}
            </p>
          </div>
          <div className="relative flex items-center justify-center py-0.5" aria-hidden="true">
            <div className="absolute inset-y-0 w-px bg-gradient-to-b from-reschedule/20 via-reschedule/50 to-reschedule/20" />
            <div className="relative z-10 flex size-7 items-center justify-center rounded-full border border-reschedule/40 bg-card-2 text-reschedule-hi shadow-sm shadow-black/40">
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v10M4.5 9.5 8 13l3.5-3.5" />
              </svg>
            </div>
          </div>
          <div className="rounded-[18px] border border-reschedule/65 bg-reschedule/15 p-3.5 shadow-[0_0_22px_rgba(84,130,166,0.16)]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-reschedule-hi">התור החדש</p>
              <span className="rounded-full border border-reschedule/40 bg-reschedule/15 px-2 py-0.5 text-[11px] font-bold text-reschedule-hi">
                מועד מעודכן
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-cream">{dateInfo.weekday}, {dateInfo.dateLabel}</p>
            <p className="font-display tabular mt-0.5 text-2xl font-bold text-reschedule-hi" dir="ltr">
              {selected.startLabel}–{selected.endLabel}
            </p>
          </div>
        </div>
        {error ? <p role="alert" className="mt-3 rounded-[12px] border border-danger/40 bg-danger/10 px-3 py-2 text-center text-sm text-danger">{error}</p> : null}
        <button type="button" disabled={pending} onClick={save} className={`${BTN_RESCHEDULE} mt-4`}>
          <DialogIcon kind="reschedule" />
          {pending ? "שומר שינוי..." : "אישור ושמירה"}
        </button>
        <button type="button" disabled={pending} onClick={() => setStep((current) => nextRescheduleStep(current, "back"))} className={`${BTN_SECONDARY} mt-2`}>
          חזרה לבחירת מועד
        </button>
      </>
    );
  }

  return (
    <>
      <SheetHeader icon="reschedule" eyebrow="ניהול תור" title="שינוי מועד" onClose={onClose} reschedule />
      <div className="mt-5 rounded-[16px] border border-line bg-bg-2/55 p-3">
        <p className="text-sm font-semibold text-cream">{appointment.customerName}</p>
        <p className="mt-1 text-xs text-sand">{appointment.serviceName} · {appointment.startLabel}–{appointment.endLabel}</p>
      </div>
      <div className="mt-4">
        <span className="mb-1 block text-sm text-sand">תאריך חדש</span>
        <NativeDateControl
          value={date}
          min={todayDate}
          max={lastBookableDate}
          ariaLabel="תאריך חדש"
          variant="dialog"
          onChange={(value) => {
            setLoading(true);
            setError(null);
            setSelectedIso("");
            setDate(value);
          }}
        />
      </div>
      <fieldset className="mt-4" disabled={loading}>
        <legend className="mb-2 text-sm text-sand">שעה חדשה</legend>
        {loading ? (
          <p className="rounded-[14px] border border-line bg-bg-2/45 px-3 py-4 text-center text-sm text-sand">טוען שעות פנויות...</p>
        ) : slots.length === 0 ? (
          <p className="rounded-[14px] border border-line bg-bg-2/45 px-3 py-4 text-center text-sm text-sand">אין שעות פנויות בתאריך הזה.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((slot) => (
              <button
                key={slot.startAtIso}
                type="button"
                onClick={() => setSelectedIso(slot.startAtIso)}
                aria-pressed={selectedIso === slot.startAtIso}
                className={`min-h-11 rounded-[12px] border px-2 text-sm font-semibold tabular focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-reschedule ${selectedIso === slot.startAtIso
                    ? "border-reschedule bg-reschedule/20 text-reschedule-hi shadow-[0_0_14px_rgba(84,130,166,0.2)]"
                    : "border-line-strong bg-bg-2/55 text-cream hover:border-reschedule/50"
                  }`}
                dir="ltr"
              >
                {slot.startLabel}
              </button>
            ))}
          </div>
        )}
      </fieldset>
      {error ? <p role="alert" className="mt-3 rounded-[12px] border border-danger/40 bg-danger/10 px-3 py-2 text-center text-sm text-danger">{error}</p> : null}
      <button type="button" disabled={!selected || loading} onClick={() => setStep((current) => nextRescheduleStep(current, "continue"))} className={`${BTN_RESCHEDULE} mt-4`}>
        המשך לאישור
      </button>
      <button type="button" onClick={onBack} className={`${BTN_SECONDARY} mt-2`}>חזרה לפרטי התור</button>
    </>
  );
}

function rescheduleError(code: string): string {
  if (code === "past") return "אי אפשר לשנות תור שכבר התחיל.";
  if (code === "not_scheduled") return "אפשר לשנות רק תור פעיל.";
  if (code === "slot_unavailable") return "המועד כבר לא פנוי. בחרו שעה אחרת.";
  if (code === "invalid_slot") return "המועד שנבחר אינו תקין.";
  return "לא הצלחנו לשנות את מועד התור. נסו שוב.";
}

export function canRescheduleAppointment(
  appointment: Pick<DeskAppointment, "status" | "canReschedule">,
): boolean {
  return appointment.status === "scheduled" && appointment.canReschedule;
}

function BlockSheet({
  block,
  weekday,
  dateLabel,
  pending,
  error,
  onClose,
  onRemove,
}: {
  block: DeskBlock;
  weekday: string;
  dateLabel: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onRemove: () => void;
}) {
  return (
    <>
      <SheetHeader icon="block" eyebrow="זמן לא זמין" title="חסימת זמן" onClose={onClose} />
      <div className="mt-5">
        <TicketSummary
          weekday={weekday}
          dateLabel={dateLabel}
          time={`${block.startLabel}${block.endLabel ? `–${block.endLabel}` : ""}`}
        />
      </div>
      <div className="mt-3 rounded-[16px] border border-brass/30 bg-brass/[0.07] px-4 py-3">
        <p className="text-xs font-semibold text-brass-hi">סיבה</p>
        <p className="mt-1 text-sm text-cream">{block.reason?.trim() || "לא צוינה סיבה"}</p>
      </div>
      {!block.past ? (
        <>
          {error ? (
            <p role="alert" className="mt-3 rounded-[12px] border border-danger/40 bg-danger/10 px-3 py-2 text-center text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button type="button" disabled={pending} onClick={onRemove} className={`${BTN_DANGER} mt-5`}>
            <DialogIcon kind="unlock" />
            {pending ? "מסיר חסימה..." : "הסרת החסימה"}
          </button>
        </>
      ) : null}
      <button type="button" onClick={onClose} className={`${BTN_SECONDARY} mt-2`}>
        סגור
      </button>
    </>
  );
}

function CreateSheet({
  slot,
  slots,
  services,
  weekday,
  dateLabel,
  onClose,
  onWrote,
}: {
  slot: DeskSlot;
  slots: DeskSlot[];
  services: DeskService[];
  weekday: string;
  dateLabel: string;
  onClose: () => void;
  onWrote: () => void;
}) {
  const [mode, setMode] = useState<"book" | "block">("book");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [confirmWithoutPhone, setConfirmWithoutPhone] = useState(false);
  const [endAtIso, setEndAtIso] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [bookSuccess, setBookSuccess] = useState<{
    name: string;
    phone: string | null;
    serviceName: string;
    timeRange: string;
    whatsappHref: string | null;
  } | null>(null);
  const [blockSuccess, setBlockSuccess] = useState<{
    range: string;
    reason: string;
  } | null>(null);

  const selectedService = services.find((service) => service.id === serviceId);
  const bookEndLabel = selectedService
    ? addClock(slot.startLabel, selectedService.durationMinutes)
    : null;
  const bookTime = bookEndLabel ? `${slot.startLabel}–${bookEndLabel}` : slot.startLabel;
  const endChoices = blockEndChoices(slots, slot);
  const selectedEnd = endAtIso || endChoices[0]?.iso || "";
  const selectedEndLabel = endChoices.find((choice) => choice.iso === selectedEnd)?.label ?? "";

  function submitBook(confirmedWithoutPhone = false) {
    setError(null);
    const nextNameError = isFullName(customerName) ? null : `נא להזין שם פרטי ושם משפחה (עד ${MAX_CUSTOMER_NAME_LENGTH} תווים)`;
    let nextPhoneError: string | null = null;
    const rawPhone = customerPhone.trim();
    let phone: string | null = null;
    if (rawPhone) {
      try {
        phone = normalizeIsraeliPhone(rawPhone);
      } catch {
        nextPhoneError = "נא להזין מספר נייד ישראלי";
      }
    }
    setNameError(nextNameError);
    setPhoneError(nextPhoneError);
    if (nextNameError || nextPhoneError || !serviceId || !selectedService) {
      return;
    }
    if (requiresMissingPhoneConfirmation(rawPhone) && !confirmedWithoutPhone) {
      setConfirmWithoutPhone(true);
      return;
    }
    const name = customerName.trim().replace(/\s+/g, " ");
    startTransition(async () => {
      try {
        const result = await createWalkIn({
          serviceId,
          startAtIso: slot.startAtIso,
          customerName: name,
          customerPhone: phone,
          confirmedWithoutPhone,
        });
        if (result.ok) {
          setBookSuccess({
            name,
            phone,
            serviceName: selectedService.name,
            timeRange: bookTime,
            whatsappHref: buildWalkInConfirmationHref({
              customerPhone: phone,
              customerName: name,
              weekday,
              dateLabel,
              timeLabel: slot.startLabel,
              serviceName: selectedService.name,
            }),
          });
          onWrote();
          return;
        }
        if (result.code === "validation_name") {
          setNameError(`נא להזין שם פרטי ושם משפחה (עד ${MAX_CUSTOMER_NAME_LENGTH} תווים)`);
          setConfirmWithoutPhone(false);
          return;
        }
        if (result.code === "validation_phone") {
          setPhoneError("נא להזין מספר נייד ישראלי");
          setConfirmWithoutPhone(false);
          return;
        }
        setError(walkInFailureMessage(result.code));
      } catch {
        setError("לא הצלחנו להגיע לשרת. בדקו את החיבור ונסו שוב.");
      }
    });
  }

  function submitBlock() {
    setError(null);
    if (!selectedEnd) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await createBlock({
          startAtIso: slot.startAtIso,
          endAtIso: selectedEnd,
          reason,
        });
        if (result.ok) {
          setBlockSuccess({
            range: `${slot.startLabel}–${selectedEndLabel}`,
            reason: reason.trim(),
          });
          onWrote();
          return;
        }
        if (result.code === "overlap") {
          setError("לא ניתן לחסום את הטווח הזה כי כבר קיים בו תור או זמן חסום.");
          return;
        }
        if (result.code === "demo_limit") {
          setError("הדמו הגיע למגבלת החסימות. אפשר לאפס את הדמו ולהמשיך.");
          return;
        }
        setError("משהו השתבש, נסו שוב.");
      } catch {
        setError("משהו השתבש, נסו שוב.");
      }
    });
  }

  const isBooking = mode === "book";

  if (bookSuccess) {
    return (
      <>
        <SheetHeader icon="success" eyebrow="הפעולה הושלמה" title="התור נשמר" onClose={onClose} success />
        <div className="mt-5">
          <TicketSummary weekday={weekday} dateLabel={dateLabel} time={bookSuccess.timeRange} />
        </div>
        <div className="mt-3 rounded-[18px] border border-ok/25 bg-ok/[0.07] p-4">
          <DetailRow icon="person" label="לקוח" value={bookSuccess.name} />
          <div className="my-3 h-px bg-ok/20" />
          <DetailRow icon="service" label="שירות" value={bookSuccess.serviceName} />
        </div>
        {bookSuccess.whatsappHref ? (
          <a
            href={bookSuccess.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BTN_WHATSAPP} mt-4`}
          >
            <DialogIcon kind="whatsapp" />
            שליחה בוואטסאפ
          </a>
        ) : (
          <p className="mt-4 rounded-[14px] border border-line bg-bg-2 px-3 py-3 text-center text-sm text-sand">
            התור נשמר ללא מספר טלפון, ולכן אין אפשרות לשלוח אישור בוואטסאפ.
          </p>
        )}
        <p className="mt-2 text-center text-xs text-mute" dir={bookSuccess.phone ? "ltr" : "rtl"}>
          {bookSuccess.phone ?? "ללא טלפון"}
        </p>
        <button type="button" onClick={onClose} className={`${BTN_SECONDARY} mt-2`}>
          סגור
        </button>
      </>
    );
  }

  if (blockSuccess) {
    return (
      <>
        <SheetHeader icon="success" eyebrow="הפעולה הושלמה" title="הזמן נחסם" onClose={onClose} success />
        <div className="mt-5">
          <TicketSummary weekday={weekday} dateLabel={dateLabel} time={blockSuccess.range} />
        </div>
        <div className="mt-3 rounded-[16px] border border-brass/30 bg-brass/[0.07] px-4 py-3">
          <p className="text-xs font-semibold text-brass-hi">סיבה</p>
          <p className="mt-1 text-sm text-cream">{blockSuccess.reason || "לא צוינה סיבה"}</p>
        </div>
        <button type="button" onClick={onClose} className={`${BTN_SECONDARY} mt-4`}>
          סגור
        </button>
      </>
    );
  }

  if (confirmWithoutPhone) {
    return (
      <>
        <SheetHeader icon="appointment" eyebrow="אישור נוסף" title="לקבוע ללא טלפון?" onClose={onClose} />
        <div className="mt-5 rounded-[18px] border border-brass/45 bg-brass/[0.08] p-4 text-sm leading-relaxed text-cream">
          <p className="font-semibold">לא הוזן מספר טלפון.</p>
          <p className="mt-2 text-sand">
            ללא מספר טלפון לא ניתן לשלוח ללקוח אישור או ליצור איתו קשר דרך המערכת.
            לקבוע את התור בכל זאת?
          </p>
        </div>
        {error ? (
          <p role="alert" className="mt-3 rounded-[12px] border border-danger/40 bg-danger/10 px-3 py-2 text-center text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => submitBook(true)}
          className={`${BTN_CREATE} mt-4`}
        >
          <DialogIcon kind="appointment" />
          {pending ? "שומר תור..." : "קביעת תור ללא טלפון"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmWithoutPhone(false)}
          className={`${BTN_SECONDARY} mt-2`}
        >
          חזרה
        </button>
      </>
    );
  }

  return (
    <>
      <SheetHeader
        icon={isBooking ? "create" : "block"}
        eyebrow={isBooking ? "שעה פנויה" : "חסימת זמן"}
        title={isBooking ? "קביעת תור" : "חסימת זמן"}
        onClose={onClose}
        success={isBooking}
      />
      <div className="mt-5">
        <TicketSummary
          weekday={weekday}
          dateLabel={dateLabel}
          time={isBooking ? bookTime : `${slot.startLabel}–${selectedEndLabel || slot.endLabel}`}
          tone={isBooking ? "ok" : "brass"}
        />
      </div>
      <div className={`mt-3 grid grid-cols-2 rounded-[15px] border p-1 ${isBooking ? "border-ok/50 bg-ok/[0.06]" : "border-brass/50 bg-brass/[0.06]"
        }`} role="tablist" aria-label="סוג פעולה">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "book"}
          onClick={() => {
            setMode("book");
            setError(null);
          }}
          className={`flex min-h-10 items-center justify-center gap-1.5 rounded-[11px] text-sm font-bold focus-visible:outline-none focus-visible:ring-1 ${isBooking
              ? "border border-ok/65 bg-ok/15 text-ok shadow-sm focus-visible:ring-ok"
              : "text-sand hover:text-cream focus-visible:ring-brass"
            }`}
        >
          <DialogIcon kind="appointment" />
          קבע תור
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "block"}
          onClick={() => {
            setMode("block");
            setError(null);
          }}
          className={`flex min-h-10 items-center justify-center gap-1.5 rounded-[11px] text-sm font-bold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass ${!isBooking
              ? "border border-brass/65 bg-brass/18 text-brass-hi shadow-sm"
              : "text-sand hover:text-cream"
            }`}
        >
          <DialogIcon kind="block" />
          חסום זמן
        </button>
      </div>

      {mode === "book" ? (
        <div className="mt-4" role="tabpanel">
          <label className="mb-2.5 block">
            <span className="mb-1 block text-sm text-sand">סוג שירות</span>
            <select
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
              className={`${DIALOG_FIELD} [color-scheme:dark]`}
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-2.5 block">
            <span className="mb-1 block text-sm text-sand">שם מלא</span>
            <input
              value={customerName}
              onChange={(event) => {
                setCustomerName(event.target.value);
                setNameError(null);
              }}
              autoComplete="name"
              name="name"
              placeholder="שם פרטי ושם משפחה"
              aria-invalid={Boolean(nameError)}
              className={DIALOG_FIELD}
            />
            {nameError ? <span role="alert" className="mt-1 block text-sm text-danger">{nameError}</span> : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-sand">טלפון (מומלץ)</span>
            <input
              value={customerPhone}
              onChange={(event) => {
                setCustomerPhone(event.target.value);
                setPhoneError(null);
                setConfirmWithoutPhone(false);
              }}
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              name="phone"
              dir="ltr"
              placeholder="05X-XXXXXXX"
              aria-invalid={Boolean(phoneError)}
              className={`${DIALOG_FIELD} text-left`}
            />
            {phoneError ? <span role="alert" className="mt-1 block text-sm text-danger">{phoneError}</span> : null}
          </label>
          <button
            type="button"
            disabled={pending || services.length === 0}
            onClick={() => submitBook()}
            className={`${BTN_CREATE} mt-3`}
          >
            <DialogIcon kind="appointment" />
            {pending ? "שומר תור..." : "שמירת התור"}
          </button>
        </div>
      ) : (
        <div className="mt-4" role="tabpanel">
          <label className="mb-2.5 block">
            <span className="mb-1 block text-sm text-sand">עד שעה</span>
            <select
              value={selectedEnd}
              onChange={(event) => setEndAtIso(event.target.value)}
              className={`${DIALOG_FIELD} [color-scheme:dark]`}
              dir="ltr"
            >
              {endChoices.map((choice) => (
                <option key={choice.iso} value={choice.iso}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-sand">סיבה (לא חובה)</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="למשל: הפסקת צהריים"
              className={DIALOG_FIELD}
            />
          </label>
          <button
            type="button"
            disabled={pending || !selectedEnd}
            onClick={submitBlock}
            className={`${BTN_PRIMARY} mt-3`}
          >
            <DialogIcon kind="block" />
            {pending ? "חוסם זמן..." : "אישור חסימת הזמן"}
          </button>
        </div>
      )}

      {error ? <p role="alert" className="mt-3 rounded-[12px] border border-danger/40 bg-danger/10 px-3 py-2 text-center text-sm text-danger">{error}</p> : null}
      <button type="button" onClick={onClose} className={`${BTN_SECONDARY} mt-2`}>
        סגור
      </button>
    </>
  );
}

type DialogIconKind =
  | "appointment"
  | "block"
  | "create"
  | "danger"
  | "delete"
  | "help"
  | "person"
  | "phone"
  | "send"
  | "whatsapp"
  | "service"
  | "success"
  | "reschedule"
  | "unlock";

function dialogLabel(overlay: Overlay | null, pendingCancel: PendingCancel | null): string {
  if (pendingCancel) {
    return "אישור ביטול תור";
  }
  if (overlay?.kind === "appointment") {
    return "פרטי תור";
  }
  if (overlay?.kind === "reschedule") {
    return "שינוי מועד תור";
  }
  if (overlay?.kind === "block") {
    return "חסימת זמן";
  }
  if (overlay?.kind === "create") {
    return "קביעת תור או חסימת זמן";
  }
  return "הסבר על היומן";
}

function SheetHeader({
  icon,
  eyebrow,
  title,
  onClose,
  danger = false,
  muted = false,
  success = false,
  reschedule = false,
}: {
  icon: DialogIconKind;
  eyebrow: string;
  title: string;
  onClose: () => void;
  danger?: boolean;
  muted?: boolean;
  success?: boolean;
  reschedule?: boolean;
}) {
  const isReschedule = reschedule || icon === "reschedule";
  const tone = danger
    ? "border-danger/45 bg-danger/12 text-danger"
    : success
      ? "border-ok/45 bg-ok/10 text-ok"
      : isReschedule
        ? "border-reschedule/45 bg-reschedule/12 text-reschedule-hi"
        : muted
          ? "border-[#5a554e] bg-[#2a2722] text-sand"
          : "border-brass/45 bg-brass/10 text-brass-hi";

  return (
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className={`flex size-11 shrink-0 items-center justify-center rounded-full border ${tone}`}>
        <DialogIcon kind={icon} large />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={`text-xs font-bold ${danger ? "text-danger" : success ? "text-ok" : isReschedule ? "text-reschedule-hi" : muted ? "text-sand" : "text-brass-hi"
          }`}>
          {eyebrow}
        </p>
        <h2 className="font-display mt-0.5 text-2xl font-bold leading-tight text-cream">{title}</h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="סגירת החלון"
        className={`flex size-10 shrink-0 items-center justify-center rounded-full border ${muted
            ? "border-[#5a554e] bg-bg-2/65 text-sand hover:border-[#736c63] hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand/40"
            : isReschedule
              ? "border-line bg-bg-2/65 text-sand hover:border-reschedule/60 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-reschedule/45"
              : "border-line bg-bg-2/65 text-sand hover:border-line-strong hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/45"
          }`}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="m6 6 8 8M14 6l-8 8" />
        </svg>
      </button>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  tone = "brass",
}: {
  icon: "person" | "service";
  label: string;
  value: string;
  tone?: "brass" | "danger" | "muted";
}) {
  const iconTone =
    tone === "danger"
      ? "border-danger/45 bg-danger/10 text-danger"
      : tone === "muted"
        ? "border-[#5a554e] bg-[#2a2722] text-sand"
        : "border-line-strong bg-bg-2 text-brass-hi";

  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className={`flex size-9 shrink-0 items-center justify-center rounded-full border ${iconTone}`}>
        <DialogIcon kind={icon} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-mute">{label}</p>
        <p className="mt-0.5 truncate text-base font-semibold text-cream">{value}</p>
      </div>
    </div>
  );
}

function DialogIcon({ kind, large = false }: { kind: DialogIconKind; large?: boolean }) {
  const className = large ? "size-6" : "size-5";
  const common = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (kind === "person") {
    return <svg {...common}><circle cx="12" cy="8" r="3.2" /><path d="M6.5 19c.3-3.5 2.2-5.4 5.5-5.4s5.2 1.9 5.5 5.4" /></svg>;
  }
  if (kind === "service") {
    return <svg {...common}><path d="m8 4 8 16M16 4 8 20" /><circle cx="7.2" cy="4.8" r="2.2" /><circle cx="16.8" cy="4.8" r="2.2" /></svg>;
  }
  if (kind === "phone") {
    return <svg {...common}><path d="M7.2 3.8 9.5 8 7.9 9.6c1.1 2.5 2.8 4.2 5.3 5.3l1.6-1.6 4.2 2.3-.7 3.4c-.2.9-1 1.5-2 1.5C9.1 20.1 3.9 14.9 3.5 7.7c-.1-1 .6-1.8 1.5-2l2.2-.5Z" /></svg>;
  }
  if (kind === "block" || kind === "unlock") {
    return <svg {...common}><circle cx="12" cy="12" r="8" /><path d={kind === "unlock" ? "m7.5 16.5 9-9M8.7 8.7l6.6 6.6" : "m7.5 16.5 9-9"} /></svg>;
  }
  if (kind === "delete" || kind === "danger") {
    return kind === "danger" ? (
      <svg {...common}><path d="M10.2 4.2 3.5 16a2 2 0 0 0 1.8 3h13.4a2 2 0 0 0 1.8-3L13.8 4.2a2 2 0 0 0-3.6 0Z" /><path d="M12 9v4M12 16h.01" /></svg>
    ) : (
      <svg {...common}><path d="M5 7h14M9 7V4h6v3M7.5 7l.8 13h7.4l.8-13M10 11v5M14 11v5" /></svg>
    );
  }
  if (kind === "success") {
    return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.3 2.3 4.9-5" /></svg>;
  }
  if (kind === "help") {
    return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M9.8 9a2.3 2.3 0 1 1 3.4 2c-.8.5-1.2 1-1.2 2M12 16.5h.01" /></svg>;
  }
  if (kind === "send") {
    return <svg {...common}><path d="m4 5 16 7-16 7 3-7-3-7Z" /><path d="M7 12h13" /></svg>;
  }
  if (kind === "whatsapp") {
    return <svg {...common}><path d="M20 11.7a8 8 0 0 1-11.8 7L4 20l1.3-4A8 8 0 1 1 20 11.7Z" /><path d="M8.7 7.8c.3-.4.6-.4.9 0l1 2c.2.4.1.7-.2 1l-.6.6c.8 1.5 1.8 2.5 3.4 3.2l.6-.8c.2-.3.6-.4.9-.2l2.1 1c.4.2.4.5.3.9-.3 1.1-1.2 1.7-2.3 1.7-3.7-.2-7.5-3.8-7.8-7.5 0-.8.6-1.6 1.7-1.9Z" /></svg>;
  }
  if (kind === "reschedule") {
    return (
      <svg {...common}>
        <path d="M14 5l3 3-3 3M17 8H7" />
        <path d="M10 19l-3-3 3-3M7 16h10" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="5" y="4" width="14" height="16" rx="3" />
      <path d="M8.5 2.8v3M15.5 2.8v3M8 10h8M8 14h5" />
      {kind === "create" ? <path d="M16 14v5M13.5 16.5h5" /> : null}
    </svg>
  );
}

function addClock(label: string, minutes: number): string {
  const [hours, mins] = label.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  const nextHours = Math.floor(total / 60) % 24;
  const nextMins = total % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMins).padStart(2, "0")}`;
}

export function blockEndChoices(slots: DeskSlot[], start: DeskSlot): { iso: string; label: string }[] {
  const later: { iso: string; label: string }[] = [];
  let stoppedAtConflict = false;
  for (const slot of slots) {
    if (slot.startAtIso <= start.startAtIso) {
      continue;
    }
    later.push({ iso: slot.startAtIso, label: slot.startLabel });
    if (slot.kind === "booked" || slot.kind === "blocked") {
      stoppedAtConflict = true;
      break;
    }
  }
  const last = slots.at(-1);
  const close =
    last && !stoppedAtConflict && !later.some((choice) => choice.iso === last.endAtIso)
      ? [{ iso: last.endAtIso, label: last.endLabel }]
      : [];
  const throughStart = [{ iso: start.endAtIso, label: start.endLabel }];
  const merged = [...throughStart, ...later, ...close];
  const seen = new Set<string>();
  return merged.filter((choice) => {
    if (seen.has(choice.iso) || choice.iso <= start.startAtIso) {
      return false;
    }
    seen.add(choice.iso);
    return true;
  });
}
