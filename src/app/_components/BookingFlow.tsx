"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { he } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { isFullName, MAX_CUSTOMER_NAME_LENGTH, normalizeIsraeliPhone } from "@/lib/customerFields";
import {
  buildIcs,
  downloadIcs,
  googleCalendarTemplateUrl,
  googleEventDetails,
} from "@/lib/calendar";
import { openAppleCalendar, preloadAppleCalendar } from "@/lib/appleCalendar";
import { selectCalendarTarget } from "@/lib/calendarPlatform";
import {
  isUpcomingTicket,
  parseLastTicket,
  readLastTicketStorage,
  removeLastTicketStorage,
  type LastTicket,
  withCurrentTicketTime,
  writeLastTicketStorage,
} from "@/lib/lastTicket";
import { buildWhatsAppBlankCancelUrl, buildWhatsAppCancelUrl } from "@/lib/whatsapp";
import {
  bookAppointment,
  getBookableDays,
  getPublicTicketStatus,
  getSlots,
  type DayOption,
  type SlotOption,
} from "../actions";
import { ShopMark } from "./ShopMark";
import { PortfolioGallery, type PublicPortfolioImage } from "./PortfolioGallery";
import { createBookingSubmission, createLatestRequest } from "./bookingRequests";
import type { LogoDisplaySize } from "@/lib/media/logoDisplay";

type ShopSettings = {
  businessName: string;
  providerName: string;
  phone: string;
  whatsappPhone: string;
  address?: string | null;
  calendarNote?: string | null;
  tagline?: string | null;
  timezone: string;
};

type ServiceOption = {
  id: string;
  name: string;
  durationMinutes: number;
  priceAgorot: number | null;
};

type TodayHours =
  | { isOpen: false }
  | { isOpen: true; openTime: string; closeTime: string };

type BookedAppointment = {
  id: string;
  customerName: string;
  customerPhone: string;
  startAtIso: string;
  endAtIso: string;
};

type Step = "landing" | "service" | "day" | "hour" | "details" | "review" | "success";

const PRESS_MS = 150;
const ERROR_COPY: Record<string, string> = {
  slot_unavailable: "השעה נתפסה, בחר שעה אחרת",
  invalid_slot: "השעה נתפסה, בחר שעה אחרת",
  service_unavailable: "השירות אינו זמין. בחרו שירות אחר.",
  validation_name: `נא להזין שם פרטי ושם משפחה (עד ${MAX_CUSTOMER_NAME_LENGTH} תווים)`,
  validation_phone: "נא להזין מספר נייד ישראלי",
  demo_limit: "הדמו הגיע למגבלת התורים. אפשר לאפס את הדמו ולהמשיך.",
  generic: "משהו השתבש, נסו שוב.",
};

export const STALE_DAY_ERROR = "התאריך הזה כבר לא זמין. בחרו תאריך אחר.";

export function rejectedAvailabilityScope(
  refreshedDays: DayOption[],
  selectedDate: string,
): "day" | "slot" {
  return refreshedDays.some((day) => day.date === selectedDate && day.available)
    ? "slot"
    : "day";
}

const STEP_LABEL: Partial<Record<Step, string>> = {
  service: "סוג שירות",
  day: "יום",
  hour: "שעה",
  details: "פרטים",
  review: "אישור",
};

const STEP_PROGRESS: Partial<Record<Step, number>> = {
  service: 0.2,
  day: 0.4,
  hour: 0.6,
  details: 0.8,
  review: 1,
};

const HEBREW_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

const WEEKDAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export function BookingFlow({
  settings,
  services,
  hoursParts,
  todayHours,
  todayIsOpen = false,
  doorNotice = "",
  exceptions = [],
  logoUrl = null,
  logoDisplaySize = "medium",
  portfolio = [],
}: {
  settings: ShopSettings;
  services: ServiceOption[];
  hoursParts: string[];
  todayHours?: TodayHours;
  todayIsOpen?: boolean;
  doorNotice?: string;
  exceptions?: { date: string; dateLabel: string; rule: string }[];
  logoUrl?: string | null;
  logoDisplaySize?: LogoDisplaySize;
  portfolio?: PublicPortfolioImage[];
}) {
  const effectiveWhatsAppPhone = settings.whatsappPhone?.trim() || settings.phone;
  const [step, setStep] = useState<Step>("landing");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayOption | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [days, setDays] = useState<DayOption[]>([]);
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [loadingDays, setLoadingDays] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booked, setBooked] = useState<BookedAppointment | null>(null);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [monthIndex, setMonthIndex] = useState(0);
  const [lastTicket, setLastTicket] = useState<LastTicket | null>(null);
  const [slideDir, setSlideDir] = useState<"forward" | "back">("forward");
  const [isPending, startTransition] = useTransition();
  const pressTimer = useRef<number | null>(null);
  const pressLocked = useRef(false);
  const daysRequest = useRef(createLatestRequest());
  const slotsRequest = useRef(createLatestRequest());
  const bookingSubmission = useRef(createBookingSubmission());

  const selectedService = services.find((service) => service.id === serviceId) ?? null;

  const summaryParts = useMemo(() => {
    const parts: string[] = [];
    if (selectedService) {
      parts.push(selectedService.name);
      parts.push(`${selectedService.durationMinutes} דק׳`);
    }
    if (selectedDay) {
      parts.push(`${selectedDay.weekday} ${selectedDay.dayMonth}`);
    }
    if (selectedSlot) {
      parts.push(selectedSlot.label);
    }
    return parts;
  }, [selectedDay, selectedService, selectedSlot]);

  const monthPanels = useMemo(() => {
    const keys: string[] = [];
    for (const day of days) {
      if (!keys.includes(day.monthKey)) {
        keys.push(day.monthKey);
      }
    }
    return keys.map((key) => ({
      key,
      label: hebrewMonthLabel(key),
      days: days.filter((day) => day.monthKey === key),
    }));
  }, [days]);

  const shopAddress = (settings.address ?? "").trim();
  const calendarNote = (settings.calendarNote ?? "").trim();
  const upcomingTicket = lastTicket && isUpcomingTicket(lastTicket) ? lastTicket : null;
  const upcomingWhen = upcomingTicket
    ? formatTicketWhen(upcomingTicket.startAt, settings.timezone)
    : null;

  useEffect(() => {
    const ticket = parseLastTicket(readLastTicketStorage());
    let cancelled = false;
    const currentDaysRequest = daysRequest.current;
    const currentSlotsRequest = slotsRequest.current;
    const currentBookingSubmission = bookingSubmission.current;

    async function hydrateTicket() {
      if (!ticket) {
        return;
      }
      if (!ticket.appointmentId) {
        if (isUpcomingTicket(ticket)) setLastTicket(ticket);
        return;
      }
      const result = await getPublicTicketStatus(ticket.appointmentId);
      if (cancelled) {
        return;
      }
      if (result.status === "scheduled") {
        const currentTicket = withCurrentTicketTime(ticket, result);
        writeLastTicketStorage(currentTicket);
        setLastTicket(currentTicket);
        return;
      }
      removeLastTicketStorage();
      setLastTicket(null);
    }

    void hydrateTicket();
    return () => {
      cancelled = true;
      currentDaysRequest.invalidate();
      currentSlotsRequest.invalidate();
      currentBookingSubmission.invalidate();
      if (pressTimer.current != null) {
        window.clearTimeout(pressTimer.current);
      }
    };
  }, []);

  function pressThen(key: string, run: () => void | Promise<void>) {
    if (pressLocked.current) {
      return;
    }
    pressLocked.current = true;
    setPressedKey(key);
    pressTimer.current = window.setTimeout(() => {
      pressLocked.current = false;
      setPressedKey(null);
      void run();
    }, PRESS_MS);
  }

  function resetWizard() {
    daysRequest.current.invalidate();
    slotsRequest.current.invalidate();
    bookingSubmission.current.invalidate();
    setLoadingDays(false);
    setLoadingSlots(false);
    setServiceId(null);
    setSelectedDay(null);
    setSelectedSlot(null);
    setCustomerName("");
    setCustomerPhone("");
    setDays([]);
    setSlots([]);
    setError(null);
    setNameError(null);
    setPhoneError(null);
    setBooked(null);
    setMonthIndex(0);
    setPressedKey(null);
  }

  function goHome() {
    setSlideDir("back");
    resetWizard();
    setStep("landing");
  }

  function goBack() {
    daysRequest.current.invalidate();
    slotsRequest.current.invalidate();
    bookingSubmission.current.invalidate();
    setLoadingDays(false);
    setLoadingSlots(false);
    setSlideDir("back");
    setError(null);
    setNameError(null);
    setPhoneError(null);
    setPressedKey(null);
    if (step === "service") {
      setStep("landing");
      return;
    }
    if (step === "day") {
      setSelectedDay(null);
      setDays([]);
      setStep("service");
      return;
    }
    if (step === "hour") {
      setSelectedSlot(null);
      setSlots([]);
      setStep("day");
      return;
    }
    if (step === "details") {
      setStep("hour");
      return;
    }
    if (step === "review") {
      setStep("details");
    }
  }

  async function chooseService(id: string) {
    slotsRequest.current.invalidate();
    setLoadingSlots(false);
    setSlideDir("forward");
    setError(null);
    setServiceId(id);
    setSelectedDay(null);
    setSelectedSlot(null);
    setDays([]);
    setSlots([]);
    setMonthIndex(0);
    setLoadingDays(true);
    setStep("day");
    await daysRequest.current.run(() => getBookableDays(id), {
      success(nextDays) {
        setDays(nextDays);
        if (!nextDays.some((day) => day.available)) setError("אין תורים פנויים בימים הקרובים.");
      },
      error() { setError(ERROR_COPY.generic); },
      settled() { setLoadingDays(false); },
    });
  }

  async function chooseDay(day: DayOption) {
    if (!day.available || !serviceId) {
      return;
    }
    setSlideDir("forward");
    setError(null);
    setSelectedDay(day);
    setSelectedSlot(null);
    setSlots([]);
    setLoadingSlots(true);
    setStep("hour");
    await slotsRequest.current.run(() => getSlots(serviceId, day.date), {
      success(nextSlots) {
        setSlots(nextSlots);
        if (nextSlots.length === 0 || !nextSlots.some((slot) => slot.status === "available")) {
          setError("אין שעות פנויות ביום הזה. בחרו יום אחר.");
        }
      },
      error() { setError(ERROR_COPY.generic); },
      settled() { setLoadingSlots(false); },
    });
  }

  async function refreshSlotsAndStayOnHour() {
    if (!serviceId || !selectedDay) {
      setStep("service");
      return;
    }
    setSelectedSlot(null);
    setSlots([]);
    setStep("hour");
    setLoadingSlots(true);
    await slotsRequest.current.run(() => getSlots(serviceId, selectedDay.date), {
      success(nextSlots) {
        setSlots(nextSlots);
        if (nextSlots.length === 0 || !nextSlots.some((slot) => slot.status === "available")) {
          setError("אין שעות פנויות ביום הזה. בחרו יום אחר.");
        }
      },
      error() { setError(ERROR_COPY.generic); },
      settled() { setLoadingSlots(false); },
    });
  }

  async function recoverFromRejectedAvailability() {
    if (!serviceId || !selectedDay) {
      resetWizard();
      setStep("service");
      return;
    }

    const rejectedDate = selectedDay.date;
    slotsRequest.current.invalidate();
    setSelectedSlot(null);
    setSlots([]);
    setLoadingSlots(false);
    setLoadingDays(true);

    await daysRequest.current.run(() => getBookableDays(serviceId), {
      success(nextDays) {
        setDays(nextDays);
        if (rejectedAvailabilityScope(nextDays, rejectedDate) === "day") {
          setSelectedDay(null);
          setStep("day");
          setError(STALE_DAY_ERROR);
          return;
        }

        const refreshedDay = nextDays.find((day) => day.date === rejectedDate) ?? null;
        setSelectedDay(refreshedDay);
        setError(ERROR_COPY.slot_unavailable);
        void refreshSlotsAndStayOnHour();
      },
      error() {
        setSelectedDay(null);
        setDays([]);
        setStep("day");
        setError(ERROR_COPY.generic);
      },
      settled() {
        setLoadingDays(false);
      },
    });
  }

  function continueFromDetails() {
    let nextNameError: string | null = null;
    let nextPhoneError: string | null = null;

    if (!isFullName(customerName)) {
      nextNameError = ERROR_COPY.validation_name;
    }

    try {
      normalizeIsraeliPhone(customerPhone.trim());
    } catch {
      nextPhoneError = ERROR_COPY.validation_phone;
    }

    setNameError(nextNameError);
    setPhoneError(nextPhoneError);
    setError(null);

    if (nextNameError || nextPhoneError) {
      return;
    }

    setSlideDir("forward");
    setStep("review");
  }

  function confirmBooking() {
    if (bookingSubmission.current.isPending()) return;
    if (!serviceId || !selectedSlot || selectedSlot.status !== "available") {
      return;
    }
    setError(null);
    setSlideDir("forward");
    startTransition(async () => {
      await bookingSubmission.current.submit(
        () => bookAppointment({
          serviceId,
          startAtIso: selectedSlot.startAtIso,
          customerName,
          customerPhone,
        }),
        {
          success: async (result) => {
            if (result.ok) {
              const ticket: LastTicket = {
                appointmentId: result.appointment.id,
                customerName: result.appointment.customerName,
                customerPhone: result.appointment.customerPhone,
                serviceName: selectedService?.name ?? "",
                startAt: result.appointment.startAtIso,
                shopName: settings.businessName,
                endAt: result.appointment.endAtIso,
              };
              writeLastTicket(ticket);
              setLastTicket(ticket);
              setBooked(result.appointment);
              setStep("success");
              return;
            }

            if (result.code === "slot_unavailable" || result.code === "invalid_slot") {
              await recoverFromRejectedAvailability();
              return;
            }
            setError(ERROR_COPY[result.code] ?? ERROR_COPY.generic);
            if (result.code === "service_unavailable") {
              resetWizard();
              setStep("service");
              setError(ERROR_COPY.service_unavailable);
              return;
            }
            if (result.code === "validation_name" || result.code === "validation_phone") {
              setStep("details");
              if (result.code === "validation_name") {
                setNameError(ERROR_COPY.validation_name);
              }
              if (result.code === "validation_phone") {
                setPhoneError(ERROR_COPY.validation_phone);
              }
            }
          },
          error: () => setError(ERROR_COPY.generic),
        },
      );
    });
  }

  const whatsappHref =
    selectedService && selectedDay && selectedSlot
      ? buildWhatsAppCancelUrl({
          whatsappPhone: effectiveWhatsAppPhone,
          customerName: customerName.trim(),
          serviceName: selectedService.name,
          dateLabel: `${selectedDay.weekday} ${selectedDay.dayMonth}`,
          timeLabel: selectedSlot.label,
        })
      : null;

  const successEvent =
    booked && selectedService
      ? calendarEventFrom({
          serviceName: selectedService.name,
          shopName: settings.businessName,
          customerName: booked.customerName,
          customerPhone: booked.customerPhone,
          startAt: booked.startAtIso,
          endAt: booked.endAtIso,
          uid: booked.id,
          location: shopAddress,
        })
      : null;

  const showChrome = step !== "landing";
  const hasStickyAction = step === "details" || step === "review";
  const stickyActionLabel =
    step === "landing"
      ? "קביעת תור"
      : step === "details"
        ? "המשך"
        : isPending
          ? "קובעים תור..."
          : "אישור תור";

  function runStickyAction() {
    if (step === "landing") {
      setSlideDir("forward");
      setStep("service");
    } else if (step === "details") {
      continueFromDetails();
    } else if (step === "review") {
      confirmBooking();
    }
  }

  return (
    <div className="shop-shell customer-shell mx-auto flex min-h-dvh w-full max-w-[520px] flex-col border-line/60 sm:border-x">
      {showChrome ? (
        <header className="sticky top-0 z-10 border-b border-line bg-card/95 backdrop-blur-xl">
          <div className="grid min-h-16 grid-cols-[1fr_auto_1fr] items-center px-5">
            <div className="justify-self-start">
              {step !== "success" ? (
                <button type="button" onClick={goBack} className="flex min-h-11 items-center gap-1.5 text-sm text-sand hover:text-cream focus-visible:outline-none focus-visible:text-cream">
                  <BackIcon />
                  <span>חזרה</span>
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={goHome}
              className="flex min-w-0 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass/60"
              aria-label="חזרה לדף הבית"
            >
              <ShopMark
                placement="header"
                logoUrl={logoUrl}
                logoDisplaySize={logoDisplaySize}
              />
              <span className="max-w-[14ch] truncate text-sm font-semibold text-cream">
                {settings.businessName}
              </span>
            </button>
            <span className="justify-self-end text-xs font-semibold text-brass-hi">{STEP_LABEL[step] ?? ""}</span>
          </div>
          {step !== "success" ? (
            <div className="progress-rail">
              <span style={{ width: `${(STEP_PROGRESS[step] ?? 0) * 100}%` }} />
            </div>
          ) : (
            <div className="h-px bg-line" />
          )}
        </header>
      ) : null}

      <div
        key={step}
        className={`step-panel flex flex-1 flex-col px-5 pb-5 pt-5 sm:px-7 sm:pt-7 ${slideDir === "back" ? "back" : ""}`}
      >
        {error ? (
          <p
            className="mb-5 border-r-2 border-danger bg-danger/[0.08] px-4 py-3 text-sm leading-relaxed text-danger"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {step === "landing" ? (
          <section className="flex flex-1 flex-col pb-3">
            <div className="flex flex-col items-center rounded-[14px] border border-brass/45 bg-[#1f1c19]/85 px-4 pb-6 pt-2 text-center sm:pb-7 sm:pt-4">
              <span className="flex min-h-20 items-center justify-center">
                <ShopMark
                  placement="hero"
                  priority
                  logoUrl={logoUrl}
                  logoDisplaySize={logoDisplaySize}
                />
              </span>
              <span aria-hidden="true" className="mt-4 h-px w-10 bg-brass/70" />
              <h1 className="font-display mt-4 max-w-[13ch] text-[2.9rem] font-bold leading-[0.98] tracking-[-0.025em] text-cream sm:text-6xl">
                {settings.businessName}
              </h1>
              <p className="mt-3 max-w-[34ch] text-base leading-relaxed text-sand">
                {settings.tagline?.trim() ? (
                  settings.tagline
                ) : (
                  <>
                    קביעת תורים בקליק.
                    <br />
                    ללא צורך בהרשמה.
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={runStickyAction}
                className="btn-primary group mt-5 flex h-14 w-full max-w-md items-center justify-between rounded-[14px] border border-brass-hi/80 bg-brass px-5 text-base font-bold text-ink shadow-[0_10px_24px_rgba(0,0,0,0.2)] hover:bg-brass-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-hi/70"
              >
                <span>קביעת תור</span>
                <ArrowIcon />
              </button>
              {!upcomingTicket ? (
                <a
                  href={buildWhatsAppBlankCancelUrl(effectiveWhatsAppPhone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex min-h-10 items-center justify-center gap-2 px-3 text-sm font-semibold text-sand hover:text-cream"
                >
                  <WhatsAppIcon />
                  <span>יש לי תור · בקשת ביטול</span>
                </a>
              ) : null}
              {doorNotice ? (
                <div className="mt-2.5 w-full max-w-md rounded-[10px] border border-brass/60 border-r-4 border-r-brass bg-brass/[0.14] px-3.5 py-3">
                  <p className="flex items-center justify-center gap-2 text-base font-bold text-brass-hi">
                    <NoticeIcon />
                    עדכון מהחנות
                  </p>
                  <p className="mt-2 text-center text-base font-semibold leading-relaxed text-cream">{doorNotice}</p>
                </div>
              ) : null}
            </div>

            {upcomingTicket && upcomingWhen ? (
              <article className="relative my-3 overflow-hidden rounded-[14px] border border-brass/40 bg-[#1f1c19] px-3 py-3" aria-labelledby="upcoming-heading">
                <div className="relative overflow-hidden rounded-t-[10px] border border-brass/35 bg-[#28241f] px-3 py-2.5 ticket-stamped">
                  <span className="pointer-events-none absolute inset-y-2 start-1.5 w-1 border-y border-brass/45" aria-hidden="true" />
                  <span className="pointer-events-none absolute inset-y-2 end-1.5 w-1 border-y border-brass/45" aria-hidden="true" />
                  <div className="relative mx-2 flex justify-center pb-1">
                    <p className="text-sm font-bold tracking-[0.12em] text-brass-hi">התור שלך</p>
                  </div>
                  <div className="relative mx-2 grid grid-cols-[1fr_auto] items-center gap-3 border-x border-brass/15 px-2 py-1">
                    <div className="border-e border-brass/20 pe-3 text-center">
                      <p className="text-lg font-bold tracking-[-0.01em] text-cream">{upcomingTicket.customerName}</p>
                      <p id="upcoming-heading" className="mt-1 text-lg font-bold leading-tight text-cream">{upcomingTicket.serviceName}</p>
                    </div>
                    <div className="min-w-[7.5rem] text-center">
                      <p className="text-xs font-semibold text-sand">{upcomingWhen.weekday}</p>
                      <p className="mt-0.5 text-sm text-sand">{upcomingWhen.dayMonth}</p>
                      <p className="font-display tabular mt-1 text-3xl font-bold leading-none text-brass-hi" dir="ltr">{upcomingWhen.time}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-0.5 rounded-b-[10px] border border-brass/30 bg-[#24221e] px-3 pb-2.5 pt-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-sand">סטטוס התור</span>
                    <span className="rounded-full border border-[#75df8d]/45 bg-[#25D366]/[0.08] px-2.5 py-0.5 text-sm font-bold text-[#8be9a0]">נקבע</span>
                  </div>
                  <div className="mt-2 border-t border-white/10 pt-2">
                    <a
                      href={buildWhatsAppCancelUrl({
                        whatsappPhone: effectiveWhatsAppPhone,
                        customerName: upcomingTicket.customerName,
                        serviceName: upcomingTicket.serviceName,
                        dateLabel: upcomingWhen.dateLabel,
                        timeLabel: upcomingWhen.time,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#55c56f]/55 bg-[#25D366]/[0.07] text-sm font-bold text-[#75df8d] hover:bg-[#25D366]/12"
                    >
                      <WhatsAppIcon />
                      <span>בקשת ביטול בוואטסאפ</span>
                    </a>
                    <CalendarButtons
                      className="mt-1"
                      size="xs"
                      icsEvent={calendarEventFrom({
                        serviceName: upcomingTicket.serviceName,
                        shopName: upcomingTicket.shopName,
                        customerName: upcomingTicket.customerName,
                        customerPhone: upcomingTicket.customerPhone,
                        startAt: upcomingTicket.startAt,
                        endAt: upcomingTicket.endAt,
                        uid: upcomingTicket.startAt,
                        location: shopAddress,
                      })}
                      googleHref={googleCalendarTemplateUrl({
                        title: `${upcomingTicket.serviceName} — ${upcomingTicket.shopName}`,
                        description: googleEventDetails({
                          calendarNote,
                          shopName: upcomingTicket.shopName,
                          address: shopAddress,
                          phone: settings.phone,
                        }),
                        startAtIso: upcomingTicket.startAt,
                        endAtIso: upcomingTicket.endAt,
                        location: shopAddress,
                      })}
                    />
                  </div>
                </div>
              </article>
            ) : null}

            {hoursParts.length > 0 || todayHours || exceptions.length > 0 || shopAddress ? (
              <section className="my-4 rounded-[14px] border border-brass/45 bg-[#1f1c19]/85 p-4" aria-labelledby="visit-heading">
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-brass/35" aria-hidden="true" />
                  <h2 id="visit-heading" className="font-display text-center text-2xl font-bold text-cream">
                    פרטי ביקור
                  </h2>
                  <span className="h-px flex-1 bg-brass/35" aria-hidden="true" />
                </div>
                {hoursParts.length > 0 || shopAddress ? (
                  <div className="mt-4 grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2">
                    {hoursParts.length > 0 ? (
                      <div className="rounded-[10px] border border-brass/20 bg-[#28241f]/85 p-3">
                        <p className="flex items-center justify-center gap-2 text-sm font-bold text-brass-hi"><ClockIcon /> שעות פתיחה</p>
                        <div className="mt-3 divide-y divide-line border-y border-line">
                          {hoursParts.map((part) => (
                            <p key={part} className="flex items-center justify-between gap-3 py-3 text-sm leading-relaxed text-cream" dir="rtl">
                              <span className="font-semibold">{splitHoursPart(part).days}</span>
                              <span className="tabular text-sand" dir="ltr">{splitHoursPart(part).hours}</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : <span />}
                    {shopAddress ? (
                      <div className="rounded-[10px] border border-brass/20 bg-[#28241f]/85 p-3">
                        <p className="flex items-center justify-center gap-2 border-b border-brass/20 pb-2.5 text-sm font-bold text-brass-hi">
                          <LocationIcon /> כתובת
                        </p>
                        <p className="mt-3 text-center text-sm font-semibold leading-snug text-cream">{shopAddress}</p>
                        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                          <a
                            href={mapsSearchUrl(shopAddress)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[#4285F4]/45 bg-[#4285F4]/[0.08] text-xs font-bold text-[#a9c7ff] hover:border-[#4285F4]/75 hover:bg-[#4285F4]/[0.14]"
                          >
                            <MapsIcon />
                            מפות
                          </a>
                          <a
                            href={wazeSearchUrl(shopAddress)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[#33a9e8]/45 bg-[#33a9e8]/[0.08] text-xs font-bold text-[#8fd8ff] hover:border-[#33a9e8]/75 hover:bg-[#33a9e8]/[0.14]"
                          >
                            <WazeIcon />
                            Waze
                          </a>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {todayHours ? (
                  <div className="mt-2.5 rounded-[10px] border border-brass/35 bg-[#28241f]/85 px-3.5 py-3">
                    <p className="text-center text-sm font-bold text-brass-hi">פעילות היום</p>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
                      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${todayIsOpen ? "bg-ok" : "bg-danger"}`} />
                      <span className={`font-semibold ${todayIsOpen ? "text-ok" : "text-danger"}`}>
                        {todayIsOpen ? "פתוח" : "סגור"}
                      </span>
                      {todayHours.isOpen ? (
                        <>
                          <span aria-hidden="true" className="text-mute">·</span>
                          <span dir="ltr" className="tabular text-sand">
                            {todayHours.openTime}–{todayHours.closeTime}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {exceptions.length > 0 ? (
                  <div className="mt-2.5 rounded-[10px] border border-line border-r-2 border-r-brass/60 bg-bg-2/55 p-3">
                    <p className="text-center text-sm font-bold text-brass-hi">שינויים קרובים</p>
                    <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
                      {exceptions.map((row) => (
                        <li key={`${row.dateLabel}-${row.rule}`} className="grid grid-cols-[auto_1fr] gap-3 py-3">
                          <span className="font-semibold text-cream">{formatExceptionHeading(row.date, row.dateLabel, settings.timezone)}</span>
                          <span className="text-left text-sand">{row.rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            <PortfolioGallery images={portfolio} />
            <section className="my-4 rounded-[14px] border border-brass/45 bg-[#1f1c19]/85 p-4" aria-labelledby="how-heading">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-brass/35" aria-hidden="true" />
                <h2 id="how-heading" className="font-display text-center text-2xl font-bold leading-tight text-cream">איך קובעים?</h2>
                <span className="h-px flex-1 bg-brass/35" aria-hidden="true" />
              </div>
              <ol className="mt-3 grid grid-cols-3 rounded-[10px] border border-brass/20 bg-[#28241f]/85">
                {["בוחרים שירות", "יום ושעה פנויים", "שם וטלפון"].map((label, index) => (
                  <li key={label} className={`flex min-h-[4.25rem] flex-col justify-center px-2 text-center ${index > 0 ? "border-s border-brass/25" : ""}`}>
                    <span className="font-display tabular text-base font-bold text-brass-hi">
                      0{index + 1}
                    </span>
                    <span className="mt-0.5 text-xs leading-tight text-sand">{label}</span>
                  </li>
                ))}
              </ol>
            </section>

          </section>
        ) : null}

        {step === "service" ? (
          <section className="rounded-[14px] border border-brass/45 bg-[#1f1c19]/85 p-4">
            <ScreenHeading eyebrow="שלב 1 מתוך 5" title="בחרו שירות" />
            {services.length === 0 ? (
              <p className="mt-6 rounded-[10px] border border-line bg-bg-2/55 py-8 text-center text-sm text-sand">אין שירותים פעילים כרגע.</p>
            ) : (
              <div className="mt-6 grid gap-2.5">
                {services.map((service) => {
                  const pressed = pressedKey === `service:${service.id}`;
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => pressThen(`service:${service.id}`, () => chooseService(service.id))}
                      className={`pressable group grid min-h-[6.25rem] w-full grid-cols-[1fr_auto] items-center gap-4 rounded-[10px] border border-brass/20 bg-[#28241f]/85 px-4 py-5 text-right hover:border-brass/55 hover:bg-[#1f1c19] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brass/70 ${
                        pressed ? "is-pressed" : ""
                      }`}
                    >
                      <span className="font-display block text-2xl font-medium leading-tight text-cream">
                        {service.name}
                      </span>
                      <span className="flex items-center justify-end gap-2 whitespace-nowrap text-base font-semibold text-sand group-hover:text-cream">
                        <span>{service.durationMinutes} דק׳</span>
                        {service.priceAgorot != null ? (
                          <>
                            <span aria-hidden="true" className="text-brass/60">·</span>
                            <span>₪{service.priceAgorot / 100}</span>
                          </>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {step === "day" ? (
          <section className="grid min-h-[calc(100dvh-7rem)] flex-1 grid-rows-[auto_1fr] rounded-[14px] border border-brass/45 bg-[#1f1c19]/85 p-4">
            {loadingDays ? (
              <div className="col-span-full row-span-2 grid grid-rows-[auto_1fr]">
                <ScreenHeading eyebrow="שלב 2 מתוך 5" title="בחרו יום" compact />
                <div className="month-grid month-grid-days mt-6 flex-1 rounded-[10px] border border-brass/20 bg-[#28241f]/85 p-1.5">
                  {Array.from({ length: 35 }, (_, index) => (
                    <div key={index} className="min-h-[4.25rem] animate-pulse rounded-[10px] border border-line bg-card/60" />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <ScreenHeading eyebrow="שלב 2 מתוך 5" title="בחרו יום" compact />
                  <div className="mt-5 mb-3 flex items-center justify-center gap-8 rounded-[10px] border border-brass/20 bg-[#28241f]/85 py-3">
                    {monthPanels.map((panel, index) => (
                      <button
                        key={panel.key}
                        type="button"
                        onClick={() => setMonthIndex(index)}
                        aria-pressed={index === monthIndex}
                        aria-controls={`booking-month-${panel.key}`}
                        className={`font-display relative min-h-8 px-1 text-lg focus-visible:outline-none focus-visible:text-brass-hi ${
                          index === monthIndex ? "text-cream" : "text-mute"
                        }`}
                      >
                        {panel.label}
                        {index === monthIndex ? (
                          <span className="absolute inset-x-0 -bottom-3 h-px bg-brass" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative min-h-0 min-w-0 overflow-y-auto rounded-[10px] border border-brass/20 bg-[#28241f]/85 p-1.5" dir="ltr">
                  <div className="w-full">
                    {monthPanels.map((panel, panelIndex) => (
                      <div
                        key={panel.key}
                        id={`booking-month-${panel.key}`}
                        role="group"
                        aria-label={panel.label}
                        className={`w-full min-w-0 rounded-[8px] ${panelIndex === monthIndex ? "grid min-h-[29rem] grid-rows-[auto_1fr]" : "hidden"}`}
                        dir="rtl"
                      >
                        <div className="month-grid mb-1">
                          {WEEKDAY_LETTERS.map((letter) => (
                            <span
                              key={letter}
                            className="py-1 text-center text-sm font-semibold text-sand"
                            >
                              {letter}
                            </span>
                          ))}
                        </div>
                        <div className="month-grid month-grid-days min-h-[25.5rem]">
                          {monthCells(panel.days).map((day, index) => {
                            if (!day) {
                              return <span key={`empty-${panel.key}-${index}`} className="min-h-0" />;
                            }
                            const pressed = pressedKey === `day:${day.date}`;
                            const occupancyLabel =
                              day.occupancy === "closed"
                                ? "סגור"
                                : day.occupancy === "full" && !day.isToday
                                  ? "מלא"
                                  : day.isToday
                                    ? "היום"
                                    : "";
                            return (
                              <button
                                key={day.date}
                                type="button"
                                disabled={!day.available}
                                onClick={() =>
                                  pressThen(`day:${day.date}`, () => chooseDay(day))
                                }
                                className={`pressable flex h-full min-h-[4.25rem] w-full flex-col items-center justify-center rounded-[10px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass/70 disabled:cursor-not-allowed ${
                                  day.available ? "border border-brass/55 bg-brass/[0.1] hover:border-brass-hi hover:bg-brass/[0.18]" : "border border-line bg-card/20 text-taken"
                                } ${pressed ? "is-pressed" : ""}`}
                              >
                                <span
                                  className={`font-display text-2xl leading-none ${
                                    day.available ? "text-cream" : "text-taken"
                                  }`}
                                >
                                  {day.dayNumber}
                                </span>
                                {occupancyLabel ? (
                                  <span className={`mt-0.5 text-xs ${day.isToday ? "font-bold text-brass-hi" : "text-mute"}`}>
                                    {occupancyLabel}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        ) : null}

        {step === "hour" ? (
          <section className="rounded-[14px] border border-brass/45 bg-[#1f1c19]/85 p-4">
            <ScreenHeading eyebrow="שלב 3 מתוך 5" title="בחרו שעה" />
            {loadingSlots ? (
              <div className="mt-6 grid grid-cols-3 gap-2.5 rounded-[10px] border border-brass/20 bg-[#28241f]/85 p-1.5">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-[10px] border border-line bg-card/60" />
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[10px] border border-brass/20 bg-[#28241f]/85 p-1.5">
                {slots.filter((slot) => slot.status === "available").length > 0 ? (
                  <div className="grid grid-cols-3 gap-2.5">
                    {slots.filter((slot) => slot.status === "available").map((slot) => {
                      const pressed = pressedKey === `slot:${slot.startAtIso}`;
                      return (
                        <button
                          key={slot.startAtIso}
                          type="button"
                          onClick={() => {
                            pressThen(`slot:${slot.startAtIso}`, () => {
                              setSlideDir("forward");
                              setSelectedSlot(slot);
                              setError(null);
                              setStep("details");
                            });
                          }}
                          className={`pressable flex min-h-16 items-center justify-center rounded-[10px] border border-brass/45 bg-[#28241f] px-2 text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass/70 hover:border-brass-hi hover:bg-[#302c27] ${
                            pressed ? "is-pressed" : ""
                          }`}
                        >
                          <span className="font-display tabular text-xl font-bold leading-none text-cream" dir="ltr">
                            {slot.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-sand">אין שעות פנויות ביום הזה.</p>
                )}
              </div>
            )}
          </section>
        ) : null}

        {step === "details" ? (
          <section className="rounded-[14px] border border-brass/45 bg-[#1f1c19]/85 p-4">
            <ScreenHeading eyebrow="שלב 4 מתוך 5" title="הפרטים שלכם" />
            <div className="mt-6 rounded-[10px] border border-brass/20 bg-[#28241f]/85 p-4">
              <label className="mb-5 block">
                <span className="mb-2 block text-center text-base font-bold text-brass-hi">שם מלא</span>
                <input
                  value={customerName}
                  onChange={(event) => {
                    setCustomerName(event.target.value);
                    setNameError(null);
                  }}
                  autoComplete="name"
                  name="name"
                  className="h-14 w-full rounded-[10px] border border-brass/25 bg-[#28241f] px-4 text-base text-cream outline-none placeholder:text-mute focus:border-brass focus:ring-1 focus:ring-brass/30"
                />
                {nameError ? (
                  <span className="mt-2 block text-sm text-danger">{nameError}</span>
                ) : null}
              </label>
              <label className="block">
                <span className="mb-2 block text-center text-base font-bold text-brass-hi">נייד</span>
                <input
                  value={customerPhone}
                  onChange={(event) => {
                    setCustomerPhone(event.target.value);
                    setPhoneError(null);
                  }}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  name="phone"
                  dir="ltr"
                  className="h-14 w-full rounded-[10px] border border-brass/25 bg-[#28241f] px-4 text-left text-base text-cream outline-none placeholder:text-mute focus:border-brass focus:ring-1 focus:ring-brass/30"
                />
                {phoneError ? (
                  <span className="mt-2 block text-sm text-danger">{phoneError}</span>
                ) : null}
              </label>
            </div>
          </section>
        ) : null}

        {step === "review" ? (
          <section className="rounded-[14px] border border-brass/45 bg-[#1f1c19]/85 p-4">
            <ScreenHeading eyebrow="שלב 5 מתוך 5" title="בדקו את התור" />
            <div className="mt-6">
              <Ticket
                serviceName={selectedService?.name ?? ""}
                weekday={selectedDay?.weekday ?? ""}
                dayMonth={selectedDay?.dayMonth ?? ""}
                time={selectedSlot?.label ?? ""}
                customerName={customerName.trim()}
                customerPhone={customerPhone.trim()}
              />
            </div>
          </section>
        ) : null}

        {step === "success" ? (
          <section className="rounded-[14px] border border-brass/45 bg-[#1f1c19]/85 p-4 pb-6 pt-4">
            <p className="text-center text-xs font-bold tracking-[0.14em] text-brass-hi">ההזמנה הושלמה</p>
            <h1 className="font-display mt-3 flex items-center justify-center gap-3 text-4xl font-bold text-cream">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full border border-brass/70 text-xl text-brass-hi"
                aria-hidden="true"
              >
                <CheckIcon />
              </span>
              התור נקבע
            </h1>
            <div className="mt-5">
              <Ticket
                serviceName={selectedService?.name ?? ""}
                weekday={selectedDay?.weekday ?? ""}
                dayMonth={selectedDay?.dayMonth ?? ""}
                time={selectedSlot?.label ?? ""}
                customerName={customerName.trim()}
                customerPhone={customerPhone.trim()}
                stamped
              />
            </div>
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex h-14 items-center justify-center gap-2 rounded-[12px] border border-[#55c56f]/55 bg-[#25D366]/[0.07] text-sm font-bold text-[#75df8d] hover:bg-[#25D366]/12"
              >
                <WhatsAppIcon />
                <span>בקשת ביטול בוואטסאפ</span>
              </a>
            ) : null}
            {successEvent ? (
              <CalendarButtons
                className="mt-1"
                icsEvent={successEvent}
                googleHref={googleCalendarTemplateUrl({
                  title: successEvent.title,
                  description: googleEventDetails({
                    calendarNote,
                    shopName: settings.businessName,
                    address: shopAddress,
                    phone: settings.phone,
                  }),
                  startAtIso: successEvent.startAtIso,
                  endAtIso: successEvent.endAtIso,
                  location: shopAddress,
                })}
              />
            ) : null}
            <button
              type="button"
              onClick={goHome}
              className="mx-auto mt-6 flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-[10px] border border-[#8b6f4a]/55 bg-[#28241f]/80 px-4 text-sm font-semibold text-sand hover:border-[#b99663]/75 hover:bg-[#302c27] hover:text-cream focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass/70"
            >
              <HomeIcon />
              <span>לדף הבית</span>
            </button>
          </section>
        ) : null}
      </div>

      {hasStickyAction ? (
        <div className="sticky bottom-0 z-10 border-t border-line bg-bg/94 px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-7">
          {step === "details" && summaryParts.length > 0 ? (
            <p className="mb-3 text-center font-display text-base leading-snug text-cream">
              {summaryParts.join(" · ")}
            </p>
          ) : null}
          <PrimaryButton onClick={runStickyAction} disabled={step === "review" && isPending}>
            {stickyActionLabel}
          </PrimaryButton>
        </div>
      ) : null}
    </div>
  );
}

function Ticket({
  serviceName,
  weekday,
  dayMonth,
  time,
  customerName,
  customerPhone,
  stamped = false,
}: {
  serviceName: string;
  weekday: string;
  dayMonth: string;
  time: string;
  customerName: string;
  customerPhone: string;
  stamped?: boolean;
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-[14px] border border-brass/40 bg-[#1f1c19] p-3 ${
        stamped ? "ticket-stamped" : ""
      }`}
    >
      <div className="relative overflow-hidden rounded-t-[10px] border border-brass/35 bg-[#28241f] px-3 py-3">
        <span className="pointer-events-none absolute inset-y-2 start-1.5 w-1 border-y border-brass/45" aria-hidden="true" />
        <span className="pointer-events-none absolute inset-y-2 end-1.5 w-1 border-y border-brass/45" aria-hidden="true" />
        <div className="mx-2 flex justify-center pb-1">
          <p className="text-sm font-bold tracking-[0.12em] text-brass-hi">פרטי התור</p>
        </div>
        <div className="mx-2 grid grid-cols-[1fr_auto] items-center gap-3 border-x border-brass/15 px-2 py-1">
          <div className="border-e border-brass/20 pe-3 text-center">
            <p className="text-lg font-bold text-cream">{customerName}</p>
            <p className="mt-1 text-lg font-bold leading-tight text-cream">{serviceName}</p>
            <p className="mt-1 text-sm tabular text-sand" dir="ltr">{customerPhone}</p>
          </div>
          <div className="min-w-[7.5rem] text-center">
            <p className="text-xs font-semibold text-sand">{weekday}</p>
            <p className="mt-0.5 text-sm text-sand">{dayMonth}</p>
            <p className="font-display tabular mt-1 text-3xl font-bold leading-none text-brass-hi" dir="ltr">
              {time}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function CalendarButtons({
  icsEvent,
  googleHref,
  className = "",
  size = "md",
}: {
  icsEvent: {
    title: string;
    description: string;
    startAtIso: string;
    endAtIso: string;
    uid: string;
    location?: string;
  };
  googleHref: string;
  className?: string;
  size?: "xs" | "sm" | "md";
}) {
  const height = size === "xs" ? "h-11" : size === "sm" ? "h-12" : "h-14";
  const actionClassName = `flex ${height} w-full items-center justify-center gap-2 rounded-[12px] border border-brass/45 bg-brass/[0.08] text-sm font-semibold text-cream hover:border-brass/75 hover:bg-brass/[0.14]`;
  const triggerId = `calendar-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const target = selectCalendarTarget({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    });

    if (target === "apple") {
      void preloadAppleCalendar().catch(() => undefined);
    }
  }, []);

  async function addToCalendar(event: React.MouseEvent<HTMLButtonElement>) {
    const target = selectCalendarTarget({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    });

    if (target === "apple") {
      await openAppleCalendar(icsEvent, event.currentTarget);
      return;
    }

    if (target === "google") {
      const anchor = document.createElement("a");
      anchor.href = googleHref;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
      return;
    }

    downloadIcs("appointment.ics", buildIcs(icsEvent));
  }

  return (
    <div className={className}>
      <button id={triggerId} type="button" onClick={addToCalendar} className={actionClassName}>
        <CalendarIcon />
        <span>הוסף ליומן</span>
      </button>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn-primary flex h-14 w-full items-center justify-center rounded-[14px] border border-brass-hi/80 bg-brass text-base font-bold text-ink shadow-[0_10px_24px_rgba(0,0,0,0.2)] hover:bg-brass-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-hi/70 disabled:cursor-wait disabled:opacity-55"
    >
      {children}
    </button>
  );
}

function ScreenHeading({
  eyebrow,
  title,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  compact?: boolean;
}) {
  return (
    <header className={compact ? "text-center" : "pt-1 text-center"}>
      <p className="text-sm font-bold tracking-[0.12em] text-brass-hi">{eyebrow}</p>
      <h1 className={`font-display font-bold leading-tight text-cream ${compact ? "mt-1 text-3xl" : "mt-2 text-4xl"}`}>
        {title}
      </h1>
    </header>
  );
}

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 12 3 3 6-7" /></svg>;
}

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M10 7l-5 5 5 5" /></svg>;
}

function BackIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13" /><path d="m13 7 5 5-5 5" /></svg>;
}

function WhatsAppIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11.7a8 8 0 0 1-11.8 7L4 20l1.3-4A8 8 0 1 1 20 11.7Z" /><path d="M8.7 7.8c.3-.4.6-.4.9 0l1 2c.2.4.1.7-.2 1l-.6.6c.8 1.5 1.8 2.5 3.4 3.2l.6-.8c.2-.3.6-.4.9-.2l2.1 1c.4.2.4.5.3.9-.3 1.1-1.2 1.7-2.3 1.7-3.7-.2-7.5-3.8-7.8-7.5 0-.8.6-1.6 1.7-1.9Z" /></svg>;
}

function CalendarIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="16" rx="3" /><path d="M8.5 2.8v3M15.5 2.8v3M8 10h8M8 14h5" /></svg>;
}

function HomeIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 10 7.5-6 7.5 6" /><path d="M6.5 9.5V20h11V9.5M10 20v-6h4v6" /></svg>;
}

function LocationIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 text-brass-hi" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></svg>;
}

function MapsIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z" /><path d="M9 4v14M15 6v14" /></svg>;
}

function WazeIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /><path d="M4 20h4M16 20h4" /></svg>;
}

function NoticeIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></svg>;
}

function ClockIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 text-brass-hi" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></svg>;
}

function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function wazeSearchUrl(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}`;
}

function hebrewMonthLabel(monthKey: string): string {
  const month = Number(monthKey.slice(5, 7));
  return HEBREW_MONTHS[month - 1] ?? monthKey;
}

function monthCells(monthDays: DayOption[]): (DayOption | null)[] {
  if (monthDays.length === 0) {
    return [];
  }
  const pad = monthDays[0].weekdayIndex;
  const cells: (DayOption | null)[] = Array.from({ length: pad }, () => null);
  cells.push(...monthDays);
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

function formatTicketWhen(startAtIso: string, timeZone: string) {
  const start = new Date(startAtIso);
  const weekday = formatInTimeZone(start, timeZone, "EEEE", { locale: he });
  const dayMonth = formatInTimeZone(start, timeZone, "d.M", { locale: he });
  const time = formatInTimeZone(start, timeZone, "HH:mm");
  return {
    weekday,
    dayMonth,
    time,
    dateLabel: `${weekday} ${dayMonth}`,
    line: `${weekday} ${dayMonth} · ${time}`,
  };
}

function formatExceptionHeading(date: string, fallback: string, timeZone: string): string {
  if (!date) {
    return fallback;
  }
  const noon = fromZonedTime(`${date}T12:00:00`, timeZone);
  return formatInTimeZone(noon, timeZone, "EEEE, dd.MM", { locale: he });
}

function splitHoursPart(part: string): { days: string; hours: string } {
  const separatorIndex = part.indexOf(" ");
  if (separatorIndex === -1) {
    return { days: part, hours: "" };
  }
  return {
    days: part.slice(0, separatorIndex),
    hours: part.slice(separatorIndex + 1),
  };
}

function calendarEventFrom(input: {
  serviceName: string;
  shopName: string;
  customerName: string;
  customerPhone: string;
  startAt: string;
  endAt: string;
  uid: string;
  location?: string | null;
}) {
  return {
    title: `${input.serviceName} — ${input.shopName}`,
    description: [
      `שם: ${input.customerName}`,
      `נייד: ${input.customerPhone}`,
      input.shopName,
    ].join("\n"),
    startAtIso: input.startAt,
    endAtIso: input.endAt,
    uid: `${input.uid}@appointment-booking`,
    location: input.location?.trim() || undefined,
  };
}

function writeLastTicket(ticket: LastTicket) {
  writeLastTicketStorage(ticket);
}
