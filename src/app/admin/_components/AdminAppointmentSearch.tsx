"use client";

import {
  startTransition,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type {
  AdminCustomerAppointment,
  AdminCustomerDetails,
  AdminCustomerSuggestion,
} from "@/lib/adminAppointmentSearch";
import { getCustomerDetails, searchCustomers } from "../actions";
import { useAdminDialogFocusTrap } from "./useAdminDialogFocusTrap";

const MIN_QUERY_LENGTH = 2;
const SEARCH_DELAY_MS = 250;

type SearchState = "idle" | "loading" | "ready" | "error";

export function AdminAppointmentSearch() {
  const inputId = useId();
  const listId = useId();
  const searchAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchSequence = useRef(0);
  const detailSequence = useRef(0);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AdminCustomerSuggestion[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [activeIndex, setActiveIndex] = useState(0);
  const [listVisible, setListVisible] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [details, setDetails] = useState<AdminCustomerDetails | null>(null);
  const [detailsState, setDetailsState] = useState<"loading" | "ready" | "error">("loading");

  const trimmedQuery = query.trim().replace(/\s+/g, " ");
  const showResultsPanel =
    listVisible &&
    trimmedQuery.length >= MIN_QUERY_LENGTH &&
    (searchState === "loading" || searchState === "ready");

  useEffect(() => {
    if (trimmedQuery.length < MIN_QUERY_LENGTH) return;

    const requestId = ++searchSequence.current;
    const timeout = window.setTimeout(() => {
      setSearchState("loading");
      startTransition(async () => {
        try {
          const result = await searchCustomers(trimmedQuery);
          if (requestId !== searchSequence.current) return;
          if (!result.ok) {
            setSuggestions([]);
            setSearchState("error");
            return;
          }
          setSuggestions(result.suggestions);
          setActiveIndex(0);
          setSearchState("ready");
        } catch {
          if (requestId !== searchSequence.current) return;
          setSuggestions([]);
          setSearchState("error");
        }
      });
    }, SEARCH_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [trimmedQuery]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !searchAreaRef.current?.contains(target)) {
        setListVisible(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function updateQuery(value: string) {
    setQuery(value);
    setListVisible(true);
    setActiveIndex(0);
    const normalized = value.trim().replace(/\s+/g, " ");
    if (normalized.length < MIN_QUERY_LENGTH) {
      searchSequence.current += 1;
      setSuggestions([]);
      setSearchState("idle");
    } else {
      setSearchState("loading");
    }
  }

  function openCustomer(suggestion: AdminCustomerSuggestion) {
    const requestId = ++detailSequence.current;
    setSelectedKey(suggestion.identityKey);
    setDetails(null);
    setDetailsState("loading");
    startTransition(async () => {
      try {
        const result = await getCustomerDetails(suggestion.identityKey);
        if (requestId !== detailSequence.current) return;
        if (!result.ok) {
          setDetailsState("error");
          return;
        }
        setDetails(result.customer);
        setDetailsState("ready");
      } catch {
        if (requestId !== detailSequence.current) return;
        setDetailsState("error");
      }
    });
  }

  function closeCustomer() {
    detailSequence.current += 1;
    setSelectedKey(null);
    setDetails(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setListVisible(false);
      return;
    }
    if (!showResultsPanel || searchState !== "ready" || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const suggestion = suggestions[activeIndex];
      if (suggestion) openCustomer(suggestion);
    }
  }

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className="admin-card-soft rounded-[22px] px-5 py-5"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="h-px flex-1 bg-brass/35" />
        <h2 id={`${inputId}-heading`} className="font-display text-center text-2xl font-bold text-cream">
          חיפוש לקוח ותורים
        </h2>
        <span aria-hidden="true" className="h-px flex-1 bg-brass/35" />
      </div>
      <p className="mt-2 text-center text-sm leading-relaxed text-sand">
        חיפוש מהיר לפי שם הלקוח או מספר הטלפון.
      </p>

      <div ref={searchAreaRef} className="relative mt-4">
        <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-cream">
          חיפוש לפי שם או טלפון
        </label>
        <div className="relative">
          {query.length === 0 ? <SearchIcon /> : null}
          <input
            ref={inputRef}
            id={inputId}
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            onFocus={() => setListVisible(true)}
            onKeyDown={onSearchKeyDown}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={showResultsPanel}
            aria-activedescendant={
              showResultsPanel && searchState === "ready" && suggestions[activeIndex]
                ? `${listId}-option-${activeIndex}`
                : undefined
            }
            autoComplete="off"
            inputMode="search"
            className={`h-12 w-full rounded-[14px] border border-line-strong bg-bg-2 py-3 text-base text-cream outline-none focus:border-brass focus:ring-1 focus:ring-brass/35 ${query.length === 0 ? "pe-3 ps-11" : "px-3"}`}
          />
        </div>

        {trimmedQuery.length < MIN_QUERY_LENGTH ? (
          <p className="mt-2 text-xs text-mute">הקלידו לפחות שני תווים.</p>
        ) : null}
        {showResultsPanel && searchState === "loading" ? (
          <div id={listId} className="mt-2 rounded-[16px] border border-line-strong bg-bg-2 px-4 py-4 shadow-[0_12px_28px_rgba(0,0,0,0.24)]" aria-live="polite">
            <p className="text-sm text-sand" role="status">מחפש…</p>
          </div>
        ) : null}
        {searchState === "error" ? (
          <p className="mt-3 text-sm text-danger" role="alert">לא ניתן להשלים את החיפוש כרגע.</p>
        ) : null}
        {showResultsPanel && searchState === "ready" && suggestions.length === 0 ? (
          <p className="mt-3 rounded-[14px] border border-line bg-bg-2/45 px-3 py-4 text-sm text-sand" role="status">
            לא נמצאו לקוחות מתאימים.
          </p>
        ) : null}
        {showResultsPanel && searchState === "ready" && suggestions.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="לקוחות תואמים"
            className="mt-2 overflow-hidden rounded-[16px] border border-line-strong bg-bg-2 shadow-[0_12px_28px_rgba(0,0,0,0.24)]"
          >
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.identityKey} role="presentation" className="border-b border-line last:border-b-0">
                <button
                  id={`${listId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openCustomer(suggestion)}
                  className={`flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 text-right hover:bg-card-2 focus-visible:bg-card-2 focus-visible:outline-none ${
                    index === activeIndex ? "bg-card-2" : ""
                  }`}
                >
                  <span className="min-w-0 truncate font-semibold text-cream">{suggestion.customerName}</span>
                  <span className="tabular shrink-0 text-sm text-sand" dir={suggestion.customerPhone ? "ltr" : "rtl"}>
                    {suggestion.customerPhone ?? "ללא טלפון"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {selectedKey ? (
        <CustomerDialog
          details={details}
          state={detailsState}
          onClose={closeCustomer}
        />
      ) : null}
    </section>
  );
}

function CustomerDialog({
  details,
  state,
  onClose,
}: {
  details: AdminCustomerDetails | null;
  state: "loading" | "ready" | "error";
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useAdminDialogFocusTrap({ open: true, dialogRef, onEscape: onClose });

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/75 px-3 pt-3 sm:items-center sm:py-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="max-h-[calc(100dvh-0.75rem)] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-line-strong bg-[linear-gradient(180deg,#2d2a25_0%,#25221e_34%,#1f1c19_100%)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-18px_60px_rgba(0,0,0,0.48)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[28px]"
      >
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-brass/45 bg-brass/10 text-brass-hi">
            <PersonIcon />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p id={descriptionId} className="text-xs font-bold text-brass-hi">פרטי לקוח</p>
            <h3 id={titleId} className="font-display mt-0.5 truncate text-2xl font-bold leading-tight text-cream">
              {details?.customerName ?? "טעינת פרטי הלקוח"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירת פרטי הלקוח"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-bg-2/65 text-sand hover:border-line-strong hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/45"
          >
            <CloseIcon />
          </button>
        </div>

        {state === "loading" ? (
          <p className="py-12 text-center text-sm text-sand" role="status">טוען את התורים…</p>
        ) : null}
        {state === "error" ? (
          <p className="my-8 rounded-[16px] border border-danger/50 bg-danger/10 px-4 py-4 text-sm text-danger" role="alert">
            לא ניתן לטעון את פרטי הלקוח כרגע.
          </p>
        ) : null}
        {state === "ready" && details ? <CustomerDetailsContent details={details} /> : null}
      </div>
    </div>
  );
}

function CustomerDetailsContent({ details }: { details: AdminCustomerDetails }) {
  const nearestIsMostRecent =
    details.nearestFutureScheduled?.id === details.mostRecentlyCreated.id;

  return (
    <>
      <div className="mt-5 flex items-center gap-3 rounded-[18px] border border-line bg-card-2/60 p-4">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-2 text-brass-hi">
          <PhoneIcon />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-mute">טלפון</p>
          <p className="tabular mt-0.5 text-base font-semibold text-cream" dir={details.customerPhone ? "ltr" : "rtl"}>
            {details.customerPhone ?? "ללא טלפון"}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {details.telHref ? (
          <a href={details.telHref} className="flex min-h-12 items-center justify-center gap-2 rounded-[14px] border border-line-strong bg-bg-2/45 px-3 py-3 text-sm font-semibold text-cream hover:border-brass/70 hover:bg-card-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/45">
            <PhoneIcon />
            חיוג
          </a>
        ) : null}
        {details.whatsappHref ? (
          <a href={details.whatsappHref} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-[14px] border border-[#55c56f]/70 bg-[#25D366]/10 px-3 py-3 text-sm font-bold text-[#75df8d] hover:border-[#75df8d] hover:bg-[#25D366]/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/45">
            <WhatsAppIcon />
            וואטסאפ
          </a>
        ) : null}
      </div>

      <section aria-labelledby="next-appointment-heading" className="mt-5">
        <h4 id="next-appointment-heading" className="font-display text-xl font-bold text-cream">התור הקרוב</h4>
        {details.nearestFutureScheduled ? (
          <AppointmentFeatureCard
            appointment={details.nearestFutureScheduled}
            eyebrow={nearestIsMostRecent ? "התור הקרוב · נוצר לאחרונה" : "התור הקרוב"}
            highlighted
          />
        ) : (
          <div className="mt-3 flex items-center gap-3 rounded-[16px] border border-line bg-bg-2/45 p-3.5">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-card-2 text-sand">
              <CalendarIcon />
            </span>
            <p className="text-sm text-sand">אין תור עתידי שנקבע.</p>
          </div>
        )}
      </section>

      {!nearestIsMostRecent ? (
        <section aria-labelledby="recent-appointment-heading" className="mt-5">
          <h4 id="recent-appointment-heading" className="font-display text-xl font-bold text-cream">התור שנוצר לאחרונה</h4>
          <AppointmentFeatureCard
            appointment={details.mostRecentlyCreated}
            eyebrow="התור שנוצר לאחרונה"
          />
        </section>
      ) : null}
    </>
  );
}

function AppointmentFeatureCard({
  appointment,
  eyebrow,
  highlighted = false,
}: {
  appointment: AdminCustomerAppointment;
  eyebrow: string;
  highlighted?: boolean;
}) {
  return (
    <article className={`mt-3 rounded-[18px] border p-4 ${highlighted ? "border-brass/50 bg-brass/[0.08]" : "border-line bg-card-2/60"}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className={`flex size-9 shrink-0 items-center justify-center rounded-full border ${highlighted ? "border-brass/45 bg-brass/10 text-brass-hi" : "border-line-strong bg-bg-2 text-sand"}`}>
          <CalendarIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-bold ${highlighted ? "text-brass-hi" : "text-sand"}`}>{eyebrow}</p>
          <p className="mt-0.5 truncate text-base font-semibold text-cream">{appointment.serviceName}</p>
        </div>
        <AppointmentStatus status={appointment.status} />
      </div>
      <div className={`mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border px-3.5 py-3 ${highlighted ? "border-brass/35 bg-bg-2/35" : "border-line bg-bg-2/55"}`}>
        <p className="min-w-0 text-sm font-medium leading-relaxed text-sand">{appointment.dateLabel}</p>
        <div className={`border-r pr-3 text-left ${highlighted ? "border-brass/35" : "border-line-strong"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">שעה</p>
          <p className={`font-display tabular mt-0.5 whitespace-nowrap text-xl font-bold ${highlighted ? "text-brass-hi" : "text-cream"}`} dir="ltr">
            {appointment.timeLabel}
          </p>
        </div>
      </div>
    </article>
  );
}

function AppointmentStatus({ status }: { status: AdminCustomerAppointment["status"] }) {
  const labels = { scheduled: "נקבע", cancelled: "בוטל", completed: "הושלם" } as const;
  const tones = {
    scheduled: "border-ok/35 bg-ok/10 text-ok",
    cancelled: "border-danger/40 bg-danger/10 text-danger",
    completed: "border-line-strong bg-bg-2 text-sand",
  } as const;
  return (
    <span className={`inline-flex shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${tones[status]}`}>
      {labels[status]}
    </span>
  );
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-brass" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
}

function PersonIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.2" /><path d="M6.5 19c.3-3.5 2.2-5.4 5.5-5.4s5.2 1.9 5.5 5.4" /></svg>;
}

function CalendarIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="16" rx="3" /><path d="M8.5 2.8v3M15.5 2.8v3M8 10h8M8 14h5" /></svg>;
}

function PhoneIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7.2 3.8 9.5 8 7.9 9.6c1.1 2.5 2.8 4.2 5.3 5.3l1.6-1.6 4.2 2.3-.7 3.4c-.2.9-1 1.5-2 1.5C9.1 20.1 3.9 14.9 3.5 7.7c-.1-1 .6-1.8 1.5-2l2.2-.5Z" /></svg>;
}

function WhatsAppIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11.7a8 8 0 0 1-11.8 7L4 20l1.3-4A8 8 0 1 1 20 11.7Z" /><path d="M8.7 7.8c.3-.4.6-.4.9 0l1 2c.2.4.1.7-.2 1l-.6.6c.8 1.5 1.8 2.5 3.4 3.2l.6-.8c.2-.3.6-.4.9-.2l2.1 1c.4.2.4.5.3.9-.3 1.1-1.2 1.7-2.3 1.7-3.7-.2-7.5-3.8-7.8-7.5 0-.8.6-1.6 1.7-1.9Z" /></svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 8 8M14 6l-8 8" /></svg>;
}
