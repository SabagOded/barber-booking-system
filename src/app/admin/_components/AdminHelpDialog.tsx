"use client";

import { useId, useRef } from "react";
import { useAdminDialogFocusTrap } from "./useAdminDialogFocusTrap";

export function AdminHelpDialog({
  title,
  items,
  onClose,
}: {
  title: string;
  items: string[];
  onClose: () => void;
}) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useAdminDialogFocusTrap({ open: true, dialogRef, onEscape: onClose });

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-[#090705]/80 p-0 backdrop-blur-[3px] sm:items-center sm:p-3"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="relative max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-brass/45 bg-[linear-gradient(180deg,#2d2a25_0%,#25221e_34%,#1f1c19_100%)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_60px_rgba(0,0,0,0.48)] sm:rounded-[28px] sm:py-5"
        onClick={(event) => event.stopPropagation()}
      >
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-12 rounded-full bg-line-strong sm:hidden" />

        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-brass/45 bg-brass/10 text-brass-hi">
            <InfoIcon />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-xs font-bold text-brass-hi">מדריך קצר</p>
            <h2 id={headingId} className="font-display mt-0.5 text-2xl font-bold leading-tight text-cream">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label="סגירת ההסבר"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-bg-2/65 text-sand hover:border-line-strong hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/45"
          >
            <CloseIcon />
          </button>
        </div>

        <ol className="mt-5 space-y-2.5">
          {items.map((item, index) => (
            <li key={item} className="flex gap-3 rounded-[16px] border border-line bg-bg-2/55 p-3.5">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-brass/45 bg-brass/10 text-sm font-bold text-brass-hi"
              >
                {index + 1}
              </span>
              <p className="pt-0.5 text-sm leading-relaxed text-sand">{item}</p>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 flex min-h-12 w-full items-center justify-center rounded-[14px] border border-line-strong bg-bg-2/45 px-4 py-3 text-sm font-semibold text-cream hover:border-brass/60 hover:bg-card-2"
        >
          סגור
        </button>
      </div>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 10v6M12 7.2h.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="m6 6 8 8M14 6l-8 8" />
    </svg>
  );
}
