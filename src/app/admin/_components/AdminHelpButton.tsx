"use client";

import type { MouseEvent } from "react";

export function AdminHelpButton({
  onClick,
  className = "",
}: {
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={`flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-line-strong px-3 text-sm font-semibold text-brass-hi hover:border-brass/60 hover:bg-card-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/40 ${className}`}
    >
      <InfoIcon />
      <span>הסבר</span>
    </button>
  );
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 10v6M12 7.2h.01" />
    </svg>
  );
}
