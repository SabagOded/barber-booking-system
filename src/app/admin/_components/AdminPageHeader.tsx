"use client";

import Link from "next/link";
import { logoutAdmin } from "../actions";
import { useAdminDemoMode } from "./AdminDemoModeContext";

export function AdminPageHeader({
  shopName,
  title,
  home = false,
  sticky = true,
}: {
  shopName?: string | null;
  title: string;
  home?: boolean;
  sticky?: boolean;
}) {
  const demoMode = useAdminDemoMode();

  return (
    <header
      className={`-mx-5 -mt-10 border-b border-brass/45 bg-card px-5 pb-4 pt-4 shadow-[0_10px_28px_rgba(0,0,0,0.26)] ${
        sticky ? "sticky top-0 z-10 backdrop-blur-md" : ""
      }`}
    >
      <div className="grid min-h-9 grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="justify-self-start">
          {!home ? (
            <Link
              href="/admin"
              className="flex min-h-9 items-center gap-1.5 text-sm text-sand hover:text-cream focus-visible:outline-none focus-visible:text-cream"
            >
              <BackIcon />
              <span>חזרה לדף הבית</span>
            </Link>
          ) : null}
        </div>

        <div className="min-w-0 text-center">
          {shopName ? <p className="truncate text-xs font-semibold text-sand">{shopName}</p> : null}
          <h1 className="font-display mt-0.5 text-[1.75rem] font-bold leading-snug text-cream">
            {title}
          </h1>
        </div>

        {!demoMode ? (
          <form action={logoutAdmin} className="justify-self-end">
            <button
              type="submit"
              className="flex min-h-9 items-center gap-1.5 text-sm text-sand hover:text-cream focus-visible:outline-none focus-visible:text-cream"
            >
              <span>יציאה</span>
              <LogoutIcon />
            </button>
          </form>
        ) : null}
      </div>
    </header>
  );
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h13" />
      <path d="m13 7 5 5-5 5" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 5H6.8A1.8 1.8 0 0 0 5 6.8v10.4A1.8 1.8 0 0 0 6.8 19H10" />
      <path d="m14 8 4 4-4 4" />
      <path d="M18 12H9" />
    </svg>
  );
}
