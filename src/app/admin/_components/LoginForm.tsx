"use client";

import { useActionState, useState } from "react";
import { loginAdmin } from "../actions";

export function LoginForm({
  shopName,
  mailtoHref,
  gmailHref,
}: {
  shopName: string;
  mailtoHref: string;
  gmailHref: string;
}) {
  const [state, action, pending] = useActionState(loginAdmin, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="flex flex-1 flex-col justify-center py-6">
      {shopName ? <p className="text-center text-xs font-semibold text-sand">{shopName}</p> : null}
      <p className="mt-3 text-center text-xs font-bold tracking-[0.18em] text-brass-hi">ADMIN</p>
      <h1 className="font-display mt-1 text-center text-3xl font-bold text-cream">כניסת ניהול</h1>
      <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-relaxed text-sand">כניסה למערכת ניהול התורים והחנות.</p>

      <form action={action} className="admin-card mt-8 rounded-[24px] px-5 py-6">
        <label htmlFor="password" className="mb-2 block text-sm text-sand">
          סיסמה
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            dir="ltr"
            aria-invalid={Boolean(state?.error)}
            aria-describedby={state?.error ? "login-error" : undefined}
            className="h-14 w-full rounded-[14px] border border-line-strong bg-bg-2 px-4 pr-12 text-left text-base text-cream outline-none focus:border-brass focus:ring-1 focus:ring-brass/35"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
            className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-[10px] text-sand hover:bg-card-2 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
          >
            <PasswordVisibilityIcon visible={showPassword} />
          </button>
        </div>
        {state?.error ? (
          <p id="login-error" className="mt-2 text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="btn-primary mt-6 flex h-14 w-full items-center justify-center rounded-[14px] bg-brass text-base font-bold text-ink shadow-[0_8px_22px_rgba(201,162,84,0.16)] disabled:opacity-60"
        >
          {pending ? "בודקים..." : "כניסה"}
        </button>
      </form>

      <details className="admin-card-soft mt-5 rounded-[20px] px-4 py-4">
        <summary className="cursor-pointer text-sm text-sand underline-offset-4 hover:underline">
          שכחתי סיסמה
        </summary>
        <div className="mt-4 border-t border-line pt-4 text-right">
          <p className="text-sm leading-relaxed text-sand">הסיסמה לא מתאפסת מכאן.</p>
          <p className="mt-2 text-sm leading-relaxed text-sand">מי שהקים את המערכת מאפס אותה.</p>
          <p className="mt-2 text-sm leading-relaxed text-sand">
            אחרי האיפוס מנהל העסק מקבל סיסמה חדשה בהודעה.
          </p>
          {gmailHref || mailtoHref ? (
            <div className="mt-5 flex flex-col gap-2">
              {gmailHref ? (
                <a
                  href={gmailHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-14 w-full items-center justify-center rounded-[14px] border border-line-strong text-sm font-medium text-brass"
                >
                  שלחו ב-Gmail
                </a>
              ) : null}
              {mailtoHref ? (
                <a
                  href={mailtoHref}
                  className="flex h-14 w-full items-center justify-center rounded-[14px] border border-line-strong text-sm font-medium text-brass"
                >
                  שלחו מאפליקציית הדואר
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>
    </main>
  );
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {visible ? (
        <>
          <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      ) : (
        <>
          <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
          <path d="m4 4 16 16" />
        </>
      )}
    </svg>
  );
}
