"use client";

import { useId, useRef, type ReactNode } from "react";
import { useAdminDialogFocusTrap } from "./useAdminDialogFocusTrap";

export function AdminConfirmDialog({
  title,
  children,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useAdminDialogFocusTrap({
    open: true,
    dialogRef,
    onEscape: () => {
      if (!pending) onClose();
    },
  });

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-[#090705]/80 p-0 backdrop-blur-[3px] sm:items-center sm:p-3"
      role="presentation"
      onClick={pending ? undefined : onClose}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] border border-danger/60 bg-[linear-gradient(180deg,#352925_0%,#29221e_38%,#211e1b_100%)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_60px_rgba(0,0,0,0.48)] sm:rounded-[28px] sm:py-5"
        onClick={(event) => event.stopPropagation()}
      >
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-12 rounded-full bg-danger/45 sm:hidden" />

        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-danger/45 bg-danger/12 text-danger">
            <WarningIcon />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-xs font-bold text-danger">נדרש אישור</p>
            <h2 id={headingId} className="font-display mt-0.5 text-2xl font-bold leading-tight text-cream">
              {title}
            </h2>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            aria-label="סגירת חלון האישור"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-bg-2/65 text-sand hover:border-danger/50 hover:text-cream disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </div>

        <div id={descriptionId} className="mt-5 rounded-[16px] border border-danger/20 bg-danger/[0.06] p-4 text-sm leading-relaxed text-sand">
          {children}
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-[12px] border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-danger/65 bg-danger/15 px-4 py-3 text-base font-bold text-danger hover:bg-danger/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <WarningIcon small />
          {pending ? pendingLabel : confirmLabel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          autoFocus
          className="mt-2 flex min-h-12 w-full items-center justify-center rounded-[14px] border border-line-strong bg-bg-2/45 px-4 py-3 text-sm font-semibold text-cream hover:border-brass/60 hover:bg-card-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}

function WarningIcon({ small = false }: { small?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={small ? "size-5" : "size-6"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.2 4.2 3.5 16a2 2 0 0 0 1.8 3h13.4a2 2 0 0 0 1.8-3L13.8 4.2a2 2 0 0 0-3.6 0Z" />
      <path d="M12 9v4M12 16h.01" />
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
