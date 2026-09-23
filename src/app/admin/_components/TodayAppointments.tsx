"use client";

import { useRef, useState } from "react";
import { useDialogFocusTrap } from "@/app/_components/useDialogFocusTrap";

type TodayAppointment = {
  id: string;
  startLabel: string;
  customerName: string;
  serviceName: string;
  customerPhone: string | null;
};

export function TodayAppointments({ appointments }: { appointments: TodayAppointment[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useDialogFocusTrap({ open, dialogRef, onEscape: close });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="mt-3 flex min-h-14 w-full items-center justify-between rounded-[16px] border border-line-strong bg-card px-4 py-3 text-right text-base font-medium text-cream hover:bg-card-2"
      >
        איך נראה הלו&quot;ז שלי היום?
        <span aria-hidden="true" className="text-lg text-brass">⌄</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-[#090705]/80 p-0 backdrop-blur-[3px] sm:items-center sm:p-3"
          role="presentation"
          onClick={close}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="today-appointments-heading"
            tabIndex={-1}
            className="relative max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-line-strong bg-[linear-gradient(180deg,#2d2a25_0%,#25221e_34%,#1f1c19_100%)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_60px_rgba(0,0,0,0.48)] sm:rounded-[28px] sm:py-5"
            onClick={(event) => event.stopPropagation()}
          >
            <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-12 rounded-full bg-line-strong sm:hidden" />
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-brass/45 bg-brass/10 text-brass-hi"><CalendarIcon /></span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-xs font-bold text-brass-hi">היום ביומן</p>
                <h2 id="today-appointments-heading" className="font-display mt-0.5 text-2xl font-bold leading-tight text-cream">איך נראה הלו&quot;ז שלי היום?</h2>
              </div>
              <button type="button" onClick={close} aria-label="סגירת לוח התורים" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-bg-2/65 text-sand hover:border-line-strong hover:text-cream"><CloseIcon /></button>
            </div>
            {appointments.length === 0 ? (
              <p className="mt-5 text-sm text-sand">אין תורים היום.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {appointments.map((row) => (
                  <li key={row.id} className="rounded-[16px] border border-brass/35 border-r-brass bg-bg-2/75 px-4 py-4 shadow-[0_6px_18px_rgba(0,0,0,0.12)]">
                    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-cream">
                      <span className="font-display tabular text-xl font-bold text-brass-hi" dir="ltr">{row.startLabel}</span>
                      <span className="text-lg font-semibold">{row.customerName}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-3 text-sm text-sand">
                      <p>{row.serviceName}</p>
                      {row.customerPhone ? (
                        <a href={`tel:${row.customerPhone}`} className="tabular text-sand hover:text-brass-hi" dir="ltr">
                          {row.customerPhone}
                        </a>
                      ) : (
                        <span className="text-mute">ללא טלפון</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}


function CalendarIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="16" rx="3" /><path d="M8.5 2.8v3M15.5 2.8v3M8 10h8M8 14h5" /></svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 8 8M14 6l-8 8" /></svg>;
}
