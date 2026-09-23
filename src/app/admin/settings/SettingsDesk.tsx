"use client";
import { AdminPageHeader } from "../_components/AdminPageHeader";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SLOT_INTERVAL_OPTIONS } from "@/lib/slotIntervals";
import { saveSlotInterval } from "./actions";

const PRIMARY =
  "btn-primary mt-4 flex h-12 w-full items-center justify-center rounded-[14px] bg-brass text-base font-bold text-ink shadow-[0_8px_22px_rgba(201,162,84,0.16)] disabled:opacity-60";
const SECONDARY =
  "flex min-h-12 w-full items-center justify-center rounded-[14px] border border-line-strong px-4 py-3 text-sm font-semibold text-cream hover:bg-card-2 disabled:cursor-not-allowed disabled:opacity-50";
const CARD = "admin-card rounded-[22px] px-5 py-5";

export function SettingsDesk({
  shopName,
  interval,
}: {
  shopName: string;
  interval: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [slotInterval, setSlotInterval] = useState(interval);
  const [savedInterval, setSavedInterval] = useState(interval);
  const [editing, setEditing] = useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setFeedback({ kind: "error", message: result.error ?? "משהו השתבש, נסו שוב." });
          return;
        }
        setFeedback({ kind: "success", message: okText });
        setSavedInterval(slotInterval);
        setEditing(false);
        router.refresh();
      } catch {
        setFeedback({ kind: "error", message: "משהו השתבש, נסו שוב." });
      }
    });
  }

  return (
    <main className="flex flex-1 flex-col gap-6 pb-8">
      <AdminPageHeader shopName={shopName} title="הגדרות החנות" />

      {feedback ? (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`rounded-[14px] border px-3 py-2 text-sm ${feedback.kind === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-ok/40 bg-ok/10 text-ok"}`}
        >
          {feedback.message}
        </p>
      ) : null}

      <section className={CARD}>
        <div>
          <h2 className="font-display text-2xl font-bold text-cream">מרווח תורים</h2>
          <p className="mt-2 text-sm leading-relaxed text-sand">קובע את המרווח הבסיסי בין נקודות הזמן שמופיעות ביומן ובהזמנות.</p>
        </div>

        {!editing ? (
          <>
            <div className="mt-5 flex items-center justify-between rounded-[16px] border border-line-strong bg-bg-2/65 px-4 py-4">
              <span className="text-sm text-sand">המרווח הנוכחי</span>
              <span className="rounded-full border border-brass/45 bg-brass/10 px-3 py-1.5 text-sm font-bold text-brass-hi">
                כל {savedInterval} דקות
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSlotInterval(savedInterval);
                setFeedback(null);
                setEditing(true);
              }}
              className={SECONDARY + " mt-4 border-brass/55 text-brass-hi"}
            >
              עריכת מרווח תורים
            </button>
          </>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {SLOT_INTERVAL_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSlotInterval(value)}
                  className={`flex h-12 items-center justify-center rounded-[12px] text-sm ${
                    slotInterval === value
                      ? "border border-brass-hi bg-brass font-bold text-ink"
                      : "border border-line-strong bg-bg-2/55 text-sand hover:border-brass/60 hover:text-cream"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={pending || slotInterval === savedInterval}
              className={PRIMARY}
              onClick={() => run(() => saveSlotInterval(slotInterval), "המרווח נשמר")}
            >
              {pending ? "שומר..." : "שמירת מרווח"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setSlotInterval(savedInterval);
                setFeedback(null);
                setEditing(false);
              }}
              className="mt-2 flex h-12 w-full items-center justify-center rounded-[14px] border border-line-strong bg-bg-2/45 text-sm font-semibold text-cream hover:border-brass/60 hover:bg-card-2"
            >
              ביטול
            </button>
          </>
        )}
      </section>
    </main>
  );
}
