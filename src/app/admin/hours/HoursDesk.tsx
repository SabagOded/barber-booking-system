"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState, useTransition } from "react";
import { AdminConfirmDialog } from "../_components/AdminConfirmDialog";
import { AdminPageHeader } from "../_components/AdminPageHeader";
import { AdminHelpDialog } from "../_components/AdminHelpDialog";
import { AdminHelpButton } from "../_components/AdminHelpButton";
import { useAdminDialogFocusTrap } from "../_components/useAdminDialogFocusTrap";
import {
  closeExceptionRange,
  removeException,
  saveWeeklyHours,
  setExceptionHours,
} from "./actions";

const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const FIELD =
  "h-12 w-full rounded-[14px] border border-line bg-bg-2 px-3 text-base text-cream outline-none [color-scheme:dark] focus:border-brass disabled:cursor-not-allowed disabled:opacity-40";
const PRIMARY =
  "btn-primary flex min-h-12 w-full items-center justify-center rounded-[14px] bg-brass px-4 py-3 text-base font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "flex min-h-12 w-full items-center justify-center rounded-[14px] border border-line-strong px-4 py-3 text-sm font-semibold text-cream hover:bg-card-2 disabled:cursor-not-allowed disabled:opacity-50";
const SECTION =
  "admin-card rounded-[22px] px-5 py-5";
const SUBSECTION = "rounded-[16px] border border-line-strong bg-bg-2/75 px-4 py-4";

export function focusWithoutScroll(element: HTMLElement | null) {
  element?.focus({ preventScroll: true });
}

type WeekRow = {
  weekday: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
};

type Feedback = {
  scope: "weekly" | "exception";
  kind: "success" | "error";
  text: string;
};

type HelpKind = "weekly" | "exception";

const HELP: Record<HelpKind, { title: string; items: string[] }> = {
  weekly: {
    title: "שעות שבועיות קבועות",
    items: [
      "אלו שעות הפתיחה הרגילות שחוזרות בכל שבוע.",
      "לקוחות מקבלים שעות חדשות להזמנה לפי השעות האלו.",
      "אפשר לסמן יום בשבוע כסגור.",
      "שינוי השעות משפיע על הזמינות העתידית.",
      "תורים שכבר נקבעו אינם מתבטלים אוטומטית.",
    ],
  },
  exception: {
    title: "שעות מיוחדות וסגירת העסק",
    items: [
      "אפשר להגדיר שעות פתיחה מיוחדות ליום נקודתי.",
      "אפשר לסגור את העסק ליום אחד או לטווח רציף של תאריכים.",
      "סגירה מחליפה שעות מיוחדות קיימות בתאריכים שנסגרו; שמירת שעות מיוחדות ליום מחליפה את הסגירה באותו יום.",
      "השעות השבועיות הקבועות נשארות ללא שינוי.",
      "סגירת יום או טווח אינה מבטלת תורים שכבר נקבעו.",
    ],
  },
};

export function HoursDesk({
  shopName,
  week,
  exceptions,
}: {
  shopName: string;
  week: WeekRow[];
  exceptions: { date: string; dateLabel: string; rule: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [weekRows, setWeekRows] = useState(week);
  const [savedWeekRows, setSavedWeekRows] = useState(week);
  const [weeklyEditing, setWeeklyEditing] = useState(false);
  const [exceptionDate, setExceptionDate] = useState("");
  const [closureStartDate, setClosureStartDate] = useState("");
  const [closureEndDate, setClosureEndDate] = useState("");
  const [exceptionOpen, setExceptionOpen] = useState("09:00");
  const [exceptionClose, setExceptionClose] = useState("15:00");
  const [exceptionToRemove, setExceptionToRemove] = useState<{
    date: string;
    rule: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [help, setHelp] = useState<HelpKind | null>(null);
  const helpTriggerRef = useRef<HTMLButtonElement | null>(null);
  const weeklyEditTriggerRef = useRef<HTMLButtonElement | null>(null);
  const exceptionRemoveTriggerRef = useRef<HTMLButtonElement | null>(null);
  const weeklyDialogRef = useRef<HTMLDivElement | null>(null);
  const exceptionHoursHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const weeklyDialogHeadingId = useId();

  const weeklyHasChanges = weekRows.some((row) => {
    const savedRow = savedWeekRows.find((item) => item.weekday === row.weekday);
    return (
      !savedRow ||
      row.isOpen !== savedRow.isOpen ||
      row.openTime !== savedRow.openTime ||
      row.closeTime !== savedRow.closeTime
    );
  });

  const closeHelp = useCallback(() => {
    helpTriggerRef.current?.focus();
    setHelp(null);
  }, []);

  const closeWeeklyEditor = useCallback(() => {
    if (pending) return;
    setWeekRows(savedWeekRows);
    setFeedback((current) => current?.scope === "weekly" ? null : current);
    setWeeklyEditing(false);
    weeklyEditTriggerRef.current?.focus();
  }, [pending, savedWeekRows]);

  const closeExceptionConfirmation = useCallback(() => {
    if (pending) return;
    setExceptionToRemove(null);
    exceptionRemoveTriggerRef.current?.focus();
  }, [pending]);

  useAdminDialogFocusTrap({
    open: weeklyEditing,
    dialogRef: weeklyDialogRef,
    onEscape: closeWeeklyEditor,
  });

  function run(
    scope: Feedback["scope"],
    action: () => Promise<{ ok: boolean; error?: string }>,
    onSuccess?: () => void,
  ) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setFeedback({
            scope,
            kind: "error",
            text: result.error ?? "לא הצלחנו לשמור את השינוי. נסו שוב.",
          });
          return;
        }
        onSuccess?.();
        setFeedback({
          scope,
          kind: "success",
          text: "השינויים נשמרו בהצלחה",
        });
        router.refresh();
      } catch {
        setFeedback({
          scope,
          kind: "error",
          text: "לא הצלחנו לשמור את השינוי. נסו שוב.",
        });
      }
    });
  }

  function updateWeekday(weekday: number, update: Partial<WeekRow>) {
    setWeekRows((current) =>
      current.map((row) => (row.weekday === weekday ? { ...row, ...update } : row)),
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-8">
      <AdminPageHeader shopName={shopName} title="שעות פעילות" />

      <section aria-labelledby="weekly-hours-heading" className={SECTION}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="weekly-hours-heading" className="font-display text-2xl font-bold text-cream">
              שעות שבועיות קבועות
            </h2>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-sand">
              עריכת שעות הפעילות הרגילות שחוזרות בכל שבוע.
            </p>
          </div>
          <AdminHelpButton
            onClick={(event) => {
              helpTriggerRef.current = event.currentTarget;
              setHelp("weekly");
            }}
          />
        </div>

        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-bg-2/65">
          {savedWeekRows.map((row) => (
            <li
              key={row.weekday}
              className="flex min-h-12 items-center justify-between gap-3 px-3 py-2.5"
            >
              <span className="font-semibold text-cream">יום {WEEKDAY_NAMES[row.weekday]}</span>
              {row.isOpen ? (
                <span dir="ltr" className="tabular text-sm font-medium text-brass-hi">
                  {row.openTime}–{row.closeTime}
                </span>
              ) : (
                <span className="rounded-full border border-line-strong px-2.5 py-1 text-xs font-semibold text-sand">
                  סגור
                </span>
              )}
            </li>
          ))}
        </ul>
        <button
          ref={weeklyEditTriggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={weeklyEditing}
          onClick={() => {
            setWeekRows(savedWeekRows);
            setFeedback((current) => current?.scope === "weekly" ? null : current);
            setWeeklyEditing(true);
          }}
          className={SECONDARY + " mt-4 border-brass/55 text-brass-hi"}
        >
          עריכת שעות שבועיות
        </button>
        <FeedbackMessage feedback={feedback?.scope === "weekly" ? feedback : null} />
      </section>

      <section aria-labelledby="exception-hours-heading" className={SECTION}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              ref={exceptionHoursHeadingRef}
              id="exception-hours-heading"
              tabIndex={-1}
              className="font-display text-balance text-2xl font-bold text-cream focus:outline-none"
            >
              שעות מיוחדות וסגירת העסק
            </h2>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-sand">
              <span className="block">הגדירו שעות שונות ליום מסוים או סגרו יום או טווח,</span>
              <span className="block">בלי לשנות את השעות השבועיות הקבועות.</span>
            </p>
          </div>
          <AdminHelpButton
            onClick={(event) => {
              helpTriggerRef.current = event.currentTarget;
              setHelp("exception");
            }}
          />
        </div>

        <div className="mt-5 space-y-3">
          <div className={SUBSECTION}>
            <h3 className="font-display text-xl font-semibold text-cream">תאריך לשעות מיוחדות</h3>
            <label className="mt-3 block">
              <input
                type="date"
                aria-label="תאריך"
                value={exceptionDate}
                onChange={(event) => {
                  setExceptionDate(event.target.value);
                  setFeedback(null);
                }}
                className={FIELD}
                dir="ltr"
              />
            </label>
            {exceptionDate ? (
              <p className="mt-3 rounded-[12px] border border-line bg-card px-3 py-2 text-sm font-medium text-cream">
                {formatSelectedDate(exceptionDate)}
              </p>
            ) : null}
          </div>

          <div className={SUBSECTION}>
            <h3 className="font-display text-xl font-semibold text-cream">
              שעות פתיחה שונות ביום הזה
            </h3>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-sand">
              העסק יהיה פתוח בשעות האלה רק בתאריך שבחרתם.
            </p>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
              <label className="min-w-0">
                <span className="mb-1 block text-xs text-sand">פתיחה</span>
                <input
                  type="time"
                  value={exceptionOpen}
                  disabled={!exceptionDate}
                  onChange={(event) => setExceptionOpen(event.target.value)}
                  className={FIELD}
                  dir="ltr"
                />
              </label>
              <span aria-hidden="true" className="pb-3 text-sand">–</span>
              <label className="min-w-0">
                <span className="mb-1 block text-xs text-sand">סגירה</span>
                <input
                  type="time"
                  value={exceptionClose}
                  disabled={!exceptionDate}
                  onChange={(event) => setExceptionClose(event.target.value)}
                  className={FIELD}
                  dir="ltr"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={pending || !exceptionDate}
              className={PRIMARY + " mt-4"}
              onClick={() =>
                run("exception", () =>
                  setExceptionHours({
                    date: exceptionDate,
                    openTime: exceptionOpen,
                    closeTime: exceptionClose,
                  }),
                )
              }
            >
              שמור שעות ליום הזה
            </button>
          </div>

          <div className={SUBSECTION}>
            <h3 className="font-display text-xl font-semibold text-cream">
              סגירת העסק ליום או לטווח
            </h3>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-sand">
              <span className="block">בתאריכים שייסגרו לא יהיה אפשר לקבוע תורים חדשים.</span>
              <span className="block">תורים שכבר קיימים אינם מתבטלים אוטומטית.</span>
            </p>
            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="min-w-0">
                <span className="mb-1 block text-xs text-sand">תאריך התחלה</span>
                <input
                  type="date"
                  value={closureStartDate}
                  onChange={(event) => {
                    const value = event.target.value;
                    setClosureStartDate(value);
                    if (closureEndDate && closureEndDate < value) setClosureEndDate("");
                    setFeedback(null);
                  }}
                  className={FIELD}
                  dir="ltr"
                />
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-xs text-sand">תאריך סיום (לא חובה)</span>
                <input
                  type="date"
                  value={closureEndDate}
                  min={closureStartDate || undefined}
                  disabled={!closureStartDate}
                  onChange={(event) => {
                    setClosureEndDate(event.target.value);
                    setFeedback(null);
                  }}
                  className={FIELD}
                  dir="ltr"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={pending || !closureStartDate}
              className={SECONDARY + " mt-4"}
              onClick={() => {
                if (closureEndDate && closureEndDate < closureStartDate) {
                  setFeedback({
                    scope: "exception",
                    kind: "error",
                    text: "תאריך הסיום לא יכול להיות מוקדם מתאריך ההתחלה",
                  });
                  return;
                }
                run("exception", () => closeExceptionRange({
                  startDate: closureStartDate,
                  endDate: closureEndDate || closureStartDate,
                }));
              }}
            >
              {closureEndDate && closureEndDate !== closureStartDate
                ? "סגור את העסק בטווח הזה"
                : "סגור את העסק בתאריך הזה"}
            </button>
          </div>
        </div>

        <FeedbackMessage feedback={feedback?.scope === "exception" ? feedback : null} />

        {exceptions.length > 0 ? (
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="font-display text-balance text-xl font-semibold text-cream">
              שינויים שכבר קבעתם לימים מסוימים
            </h3>
            <ul className="mt-3 space-y-2">
              {exceptions.map((row) => (
                <li
                  key={row.date}
                  className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-bg-2 px-3 py-3"
                >
                  <span>
                    <span className="block font-medium text-cream">
                      {formatSelectedDate(row.date)}
                    </span>
                    <span className="mt-1 block text-sm text-sand">
                      {row.rule === "סגור" ? "סגור לכל היום" : (
                        <span dir="ltr" className="tabular inline-block">{row.rule}</span>
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    className="min-h-10 shrink-0 rounded-[12px] border border-line-strong px-3 text-sm text-sand hover:bg-card-2 hover:text-cream disabled:opacity-50"
                    onClick={(event) => {
                      setFeedback(null);
                      exceptionRemoveTriggerRef.current = event.currentTarget;
                      setExceptionToRemove({ date: row.date, rule: row.rule });
                    }}
                  >
                    הסרת השינוי
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {weeklyEditing ? (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-ink/75 p-0 backdrop-blur-[2px] sm:items-center sm:p-3"
          role="presentation"
          onClick={pending ? undefined : closeWeeklyEditor}
        >
          <div
            ref={weeklyDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={weeklyDialogHeadingId}
            tabIndex={-1}
            className="flex max-h-[92dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[28px] border border-line-strong bg-[linear-gradient(180deg,#2d2a25_0%,#25221e_34%,#1f1c19_100%)] px-4 pt-4 shadow-[0_24px_32px_rgba(0,0,0,0.28)] sm:rounded-[22px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-brass-hi">עריכת שעות שבועיות</p>
                <h2 id={weeklyDialogHeadingId} className="font-display mt-1 text-2xl font-bold text-cream">
                  שעות הפעילות הקבועות
                </h2>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={closeWeeklyEditor}
                autoFocus
                className="min-h-10 shrink-0 text-sm text-sand hover:text-cream disabled:opacity-50"
              >
                סגור
              </button>
            </div>

            <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-3 pb-4">
                {weekRows.map((row) => (
                  <div
                    key={row.weekday}
                    className="rounded-[16px] border border-line bg-bg-2 px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-display text-lg font-semibold text-cream">
                        יום {WEEKDAY_NAMES[row.weekday]}
                      </p>
                      <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-sm text-sand">
                        <input
                          type="checkbox"
                          checked={!row.isOpen}
                          disabled={pending}
                          onChange={(event) =>
                            updateWeekday(row.weekday, { isOpen: !event.target.checked })
                          }
                          className="size-4 accent-brass"
                        />
                        סגור
                      </label>
                    </div>
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                      <label className="min-w-0">
                        <span className="mb-1 block text-xs text-sand">פתיחה</span>
                        <input
                          type="time"
                          value={row.openTime}
                          disabled={pending || !row.isOpen}
                          onChange={(event) =>
                            updateWeekday(row.weekday, { openTime: event.target.value })
                          }
                          className={FIELD}
                          dir="ltr"
                        />
                      </label>
                      <span aria-hidden="true" className="pb-3 text-sand">–</span>
                      <label className="min-w-0">
                        <span className="mb-1 block text-xs text-sand">סגירה</span>
                        <input
                          type="time"
                          value={row.closeTime}
                          disabled={pending || !row.isOpen}
                          onChange={(event) =>
                            updateWeekday(row.weekday, { closeTime: event.target.value })
                          }
                          className={FIELD}
                          dir="ltr"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <FeedbackMessage feedback={feedback?.scope === "weekly" ? feedback : null} />
            </div>

            <div className="grid shrink-0 gap-2 border-t border-line bg-card/95 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:grid-cols-2">
              <button
                type="button"
                disabled={pending}
                onClick={closeWeeklyEditor}
                className={SECONDARY}
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={pending || !weeklyHasChanges}
                className={PRIMARY}
                onClick={() => {
                  const nextRows = weekRows;
                  run("weekly", () => saveWeeklyHours(nextRows), () => {
                    setSavedWeekRows(nextRows);
                    setWeeklyEditing(false);
                    weeklyEditTriggerRef.current?.focus();
                  });
                }}
              >
                {pending ? "שומר שעות..." : "שמור שעות שבועיות"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {exceptionToRemove ? (
        <AdminConfirmDialog
          title="להסיר את השינוי ליום הזה?"
          confirmLabel="כן, להסיר את השינוי"
          pendingLabel="מסיר שינוי..."
          pending={pending}
          error={feedback?.scope === "exception" && feedback.kind === "error" ? feedback.text : null}
          onClose={closeExceptionConfirmation}
          onConfirm={() =>
            run("exception", () => removeException(exceptionToRemove.date), () => {
              setExceptionToRemove(null);
              window.requestAnimationFrame(() => focusWithoutScroll(exceptionHoursHeadingRef.current));
            })
          }
        >
          <p className="rounded-[14px] border border-line bg-bg-2 px-3 py-3 font-semibold text-cream">
            {formatSelectedDate(exceptionToRemove.date)} · {exceptionToRemove.rule === "סגור" ? "סגור לכל היום" : exceptionToRemove.rule}
          </p>
          <p className="mt-3">
            לאחר ההסרה יחזרו לחול בתאריך הזה השעות השבועיות הקבועות, ולכן זמינות ההזמנות עשויה להשתנות.
          </p>
        </AdminConfirmDialog>
      ) : null}

      {help ? (
        <AdminHelpDialog
          title={HELP[help].title}
          items={HELP[help].items}
          onClose={closeHelp}
        />
      ) : null}
    </main>
  );
}

function FeedbackMessage({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) {
    return null;
  }

  return (
    <p
      role={feedback.kind === "error" ? "alert" : "status"}
      aria-live="polite"
      className={
        "mt-3 rounded-[12px] border px-3 py-2 text-sm " +
        (feedback.kind === "success"
          ? "border-ok/40 bg-ok/10 text-ok"
          : "border-danger/40 bg-danger/10 text-danger")
      }
    >
      {feedback.text}
    </p>
  );
}

function formatSelectedDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) {
    return date;
  }
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
