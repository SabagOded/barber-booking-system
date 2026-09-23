"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState, useTransition } from "react";
import type { AdminServiceRow, ServiceInput } from "@/lib/adminServices";
import { AdminConfirmDialog } from "../_components/AdminConfirmDialog";
import { AdminPageHeader } from "../_components/AdminPageHeader";
import { AdminHelpDialog } from "../_components/AdminHelpDialog";
import { AdminHelpButton } from "../_components/AdminHelpButton";
import { useAdminDialogFocusTrap } from "../_components/useAdminDialogFocusTrap";
import {
  createService,
  removeService,
  restoreService,
  updateService,
  type ServiceActionResult,
} from "./actions";
import { ServiceOrderEditor } from "./ServiceOrderEditor";

const FIELD =
  "h-12 w-full rounded-[14px] border border-line bg-bg-2 px-3 text-base text-cream outline-none [color-scheme:dark] focus:border-brass disabled:cursor-not-allowed disabled:opacity-40";
const PRIMARY =
  "btn-primary flex min-h-12 w-full items-center justify-center rounded-[14px] bg-brass px-4 py-3 text-base font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "flex min-h-12 w-full items-center justify-center rounded-[14px] border border-line-strong px-4 py-3 text-sm font-semibold text-cream hover:bg-card-2 disabled:cursor-not-allowed disabled:opacity-50";
const SECTION =
  "admin-card rounded-[22px] px-5 py-5";

type Feedback = { kind: "success" | "error"; text: string };
type HelpKind = "add" | "active";

const HELP: Record<HelpKind, { title: string; items: string[] }> = {
  add: {
    title: "הוספת שירות",
    items: [
      "משך השירות קובע כמה זמן יישמר ביומן לכל תור חדש מהסוג הזה.",
      "משך ארוך או קצר יותר משנה אילו שעות יוכלו להופיע ללקוחות כזמינות.",
      "המחיר נשמר בשקלים ובאגורות ומוצג ללקוחות בעת בחירת השירות.",
    ],
  },
  active: {
    title: "ניהול השירותים הפעילים",
    items: [
      "סדר הופעת השירותים כאן הוא גם הסדר שיוצג ללקוחות בזמן קביעת תור.",
      "כדי לשנות את הסדר, פתחו מצב עריכת סדר, גררו את השירותים ואשרו את השינוי.",
      "הסרת שירות מונעת קביעת תורים חדשים עבורו, אבל אינה משנה תורים שכבר נקבעו.",
      "שירות שהוסר נשמר במערכת ואפשר לשחזר אותו מאוחר יותר.",
    ],
  },
};

const EMPTY_SERVICE: ServiceInput = {
  name: "",
  durationMinutes: "",
  priceShekels: "",
};

export function ServicesDesk({
  shopName,
  activeServices,
  removedServices,
}: {
  shopName: string;
  activeServices: AdminServiceRow[];
  removedServices: AdminServiceRow[];
}) {
  const [help, setHelp] = useState<HelpKind | null>(null);
  const [ordering, setOrdering] = useState(false);
  const helpTriggerRef = useRef<HTMLButtonElement | null>(null);
  const orderTriggerRef = useRef<HTMLButtonElement | null>(null);
  const activeServicesHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const closeHelp = useCallback(() => {
    helpTriggerRef.current?.focus();
    setHelp(null);
  }, []);

  function closeOrdering() {
    setOrdering(false);
    window.requestAnimationFrame(() => orderTriggerRef.current?.focus());
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-8">
      <AdminPageHeader shopName={shopName} title="שירותים ומחירים" />

      <AddServiceCard
        onHelp={(trigger) => {
          helpTriggerRef.current = trigger;
          setHelp("add");
        }}
      />

      <section aria-labelledby="active-services-heading" className={SECTION}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              ref={activeServicesHeadingRef}
              id="active-services-heading"
              tabIndex={-1}
              className="font-display text-2xl font-bold text-cream focus:outline-none"
            >
              שירותים פעילים
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-sand">
              השירותים שמופיעים ללקוחות בעת קביעת תור.
            </p>
          </div>
          <AdminHelpButton
            onClick={(event) => {
              helpTriggerRef.current = event.currentTarget;
              setHelp("active");
            }}
          />
        </div>
        {activeServices.length > 0 ? (
          ordering ? (
            <ServiceOrderEditor
              services={activeServices}
              onCancel={closeOrdering}
              onSaved={closeOrdering}
            />
          ) : (
            <>
              <button
                ref={orderTriggerRef}
                type="button"
                disabled={activeServices.length < 2}
                onClick={() => setOrdering(true)}
                className={SECONDARY + " mt-4"}
              >
                עריכת סדר הופעת השירותים
              </button>
              <div className="mt-4 space-y-3">
                {activeServices.map((service) => (
                  <ServiceEditor
                    key={service.id}
                    service={service}
                    onRemoved={() => activeServicesHeadingRef.current?.focus()}
                  />
                ))}
              </div>
            </>
          )
        ) : (
          <p className="mt-5 rounded-[14px] border border-line bg-bg-2 px-4 py-4 text-sm text-sand">
            אין כרגע שירותים פעילים.
          </p>
        )}
      </section>

      <details className={SECTION}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-cream marker:hidden">
          <span className="font-display text-xl font-bold">שירותים שהוסרו</span>
          <span className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-sand">
            {removedServices.length}
          </span>
        </summary>
        {removedServices.length > 0 ? (
          <ul className="mt-4 space-y-3 border-t border-line pt-4">
            {removedServices.map((service) => (
              <RemovedService key={service.id} service={service} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 border-t border-line pt-4 text-sm text-sand">
            אין שירותים שהוסרו.
          </p>
        )}
      </details>

      {help ? (
        <AdminHelpDialog title={HELP[help].title} items={HELP[help].items} onClose={closeHelp} />
      ) : null}
    </main>
  );
}

function AddServiceCard({ onHelp }: { onHelp: (trigger: HTMLButtonElement) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<ServiceInput>(EMPTY_SERVICE);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const result = await safely(() => createService(form));
      if (!result.ok) {
        setFeedback({ kind: "error", text: result.error });
        return;
      }
      setForm(EMPTY_SERVICE);
      setFeedback({ kind: "success", text: "השירות נוסף בהצלחה." });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="add-service-heading" className={SECTION}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="add-service-heading" className="font-display text-2xl font-bold text-cream">
            הוספת שירות
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-sand">
            הגדירו שם, משך ומחיר שיוצגו ללקוחות.
          </p>
        </div>
        <AdminHelpButton onClick={(event) => onHelp(event.currentTarget)} />
      </div>
      <ServiceFields form={form} disabled={pending} onChange={(next) => {
        setForm(next);
        setFeedback(null);
      }} />
      <button type="button" disabled={pending} className={PRIMARY + " mt-4"} onClick={submit}>
        הוספת שירות
      </button>
      <FeedbackMessage feedback={feedback} />
    </section>
  );
}

function ServiceEditor({
  service,
  onRemoved,
}: {
  service: AdminServiceRow;
  onRemoved: () => void;
}) {
  const router = useRouter();
  const initial = serviceToInput(service);
  const [form, setForm] = useState<ServiceInput>(initial);
  const [saved, setSaved] = useState<ServiceInput>(initial);
  const [editing, setEditing] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, startTransition] = useTransition();
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const editDialogRef = useRef<HTMLDivElement | null>(null);
  const editDialogHeadingId = useId();
  const changed = !sameInput(form, saved);

  function run(
    action: () => Promise<ServiceActionResult>,
    successText: string,
    onSuccess?: () => void,
  ) {
    setFeedback(null);
    startTransition(async () => {
      const result = await safely(action);
      if (!result.ok) {
        setFeedback({ kind: "error", text: result.error });
        return;
      }
      const normalized = serviceToInput(result.service);
      setForm(normalized);
      setSaved(normalized);
      setFeedback({ kind: "success", text: successText });
      onSuccess?.();
      router.refresh();
    });
  }

  function beginEditing() {
    const current = serviceToInput(service);
    setForm(current);
    setSaved(current);
    setFeedback(null);
    setEditing(true);
  }

  const closeEditor = useCallback(() => {
    if (pending || confirmingRemoval) return;
    setForm(saved);
    setFeedback(null);
    setEditing(false);
    editTriggerRef.current?.focus();
  }, [confirmingRemoval, pending, saved]);

  useAdminDialogFocusTrap({ open: editing, dialogRef: editDialogRef, onEscape: closeEditor });

  function closeRemovalConfirmation() {
    if (pending) return;
    setConfirmingRemoval(false);
    removeTriggerRef.current?.focus();
  }

  return (
    <article className="rounded-[18px] border border-line bg-bg-2/65 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-lg font-semibold text-cream">{service.name}</span>
          <span className="mt-1 block text-sm text-sand">
            {service.durationMinutes} דק׳{formatPriceLabel(service.priceAgorot)}
          </span>
        </span>
        <button
          ref={editTriggerRef}
          type="button"
          disabled={pending}
          aria-haspopup="dialog"
          aria-expanded={editing}
          className="min-h-10 shrink-0 rounded-[12px] border border-line-strong px-3 text-sm font-semibold text-cream hover:bg-card-2 disabled:opacity-50"
          onClick={beginEditing}
        >
          עריכה
        </button>
      </div>

      {editing ? (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-ink/75 px-3 backdrop-blur-[2px] sm:items-center sm:p-3"
          role="presentation"
          onClick={pending || confirmingRemoval ? undefined : closeEditor}
        >
          <div
            ref={editDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={editDialogHeadingId}
            tabIndex={-1}
            className="max-h-[92dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[28px] border border-line-strong bg-[linear-gradient(180deg,#2d2a25_0%,#25221e_34%,#1f1c19_100%)] px-4 py-4 shadow-[0_24px_32px_rgba(0,0,0,0.28)] sm:rounded-[22px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-brass-hi">עריכת שירות</p>
                <h2 id={editDialogHeadingId} className="font-display mt-1 truncate text-2xl font-bold text-cream">
                  {service.name}
                </h2>
              </div>
              <button
                type="button"
                disabled={pending || confirmingRemoval}
                onClick={closeEditor}
                autoFocus
                className="min-h-10 shrink-0 text-sm text-sand hover:text-cream disabled:opacity-50"
              >
                סגור
              </button>
            </div>

            <ServiceFields form={form} disabled={pending} onChange={(next) => {
              setForm(next);
              setFeedback(null);
            }} />
            <FeedbackMessage feedback={feedback} />

            <button
              type="button"
              disabled={pending || !changed}
              className={PRIMARY + " mt-4"}
              onClick={() =>
                run(() => updateService(service.id, form), "השירות עודכן בהצלחה.", () => {
                  setEditing(false);
                  window.requestAnimationFrame(() => editTriggerRef.current?.focus());
                })
              }
            >
              {pending ? "שומר שינויים..." : "שמירת שינויים"}
            </button>
            <button
              ref={removeTriggerRef}
              type="button"
              disabled={pending}
              className={SECONDARY + " mt-2 text-danger"}
              onClick={() => {
                setFeedback(null);
                setConfirmingRemoval(true);
              }}
            >
              הסרת שירות
            </button>
            <button
              type="button"
              disabled={pending || confirmingRemoval}
              onClick={closeEditor}
              className={SECONDARY + " mt-2"}
            >
              ביטול
            </button>
          </div>
        </div>
      ) : null}
      {!editing ? <FeedbackMessage feedback={feedback} /> : null}

      {confirmingRemoval ? (
        <AdminConfirmDialog
          title={`להסיר את ${service.name}?`}
          confirmLabel="כן, להסיר את השירות"
          pendingLabel="מסיר שירות..."
          pending={pending}
          error={feedback?.kind === "error" ? feedback.text : null}
          onClose={closeRemovalConfirmation}
          onConfirm={() =>
            run(() => removeService(service.id), "השירות הוסר.", () => {
              setConfirmingRemoval(false);
              setEditing(false);
              window.requestAnimationFrame(onRemoved);
            })
          }
        >
          <p className="rounded-[14px] border border-line bg-bg-2 px-3 py-3 font-semibold text-cream">
            {service.name}
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pr-5">
            <li>השירות ייעלם מרשימת השירותים להזמנות חדשות.</li>
            <li>תורים קיימים שנקבעו עם השירות יישארו ללא שינוי.</li>
            <li>אפשר יהיה לשחזר את אותו שירות מאוחר יותר.</li>
          </ul>
        </AdminConfirmDialog>
      ) : null}
    </article>
  );
}

function RemovedService({ service }: { service: AdminServiceRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function restore() {
    setFeedback(null);
    startTransition(async () => {
      const result = await safely(() => restoreService(service.id));
      if (!result.ok) {
        setFeedback({ kind: "error", text: result.error });
        return;
      }
      setFeedback({ kind: "success", text: "השירות שוחזר." });
      router.refresh();
    });
  }

  return (
    <li className="rounded-[16px] border border-line bg-bg-2/65 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <span>
          <span className="block font-semibold text-cream">{service.name}</span>
          <span className="mt-1 block text-sm text-sand">
            {service.durationMinutes} דק׳{formatPriceLabel(service.priceAgorot)}
          </span>
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={restore}
          className="min-h-10 shrink-0 rounded-[12px] border border-brass/60 px-3 text-sm font-semibold text-brass-hi hover:bg-card-2 disabled:opacity-50"
        >
          שחזר שירות
        </button>
      </div>
      <FeedbackMessage feedback={feedback} />
    </li>
  );
}

function ServiceFields({
  form,
  disabled,
  onChange,
}: {
  form: ServiceInput;
  disabled: boolean;
  onChange: (next: ServiceInput) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm text-sand">שם השירות</span>
        <input
          value={form.name}
          disabled={disabled}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          className={FIELD}
          placeholder="למשל: תספורת גבר"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm text-sand">משך בדקות</span>
          <input
            value={form.durationMinutes}
            disabled={disabled}
            onChange={(event) => onChange({ ...form, durationMinutes: event.target.value })}
            inputMode="numeric"
            dir="ltr"
            className={FIELD + " text-left"}
            placeholder="30"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-sand">מחיר בש״ח</span>
          <input
            value={form.priceShekels}
            disabled={disabled}
            onChange={(event) => onChange({ ...form, priceShekels: event.target.value })}
            inputMode="decimal"
            dir="ltr"
            className={FIELD + " text-left"}
            placeholder="לא חובה"
          />
        </label>
      </div>
    </div>
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

async function safely(action: () => Promise<ServiceActionResult>): Promise<ServiceActionResult> {
  try {
    return await action();
  } catch {
    return { ok: false, code: "failed", error: "לא הצלחנו לשמור את השינוי. נסו שוב." };
  }
}

function serviceToInput(service: AdminServiceRow): ServiceInput {
  return {
    name: service.name,
    durationMinutes: String(service.durationMinutes),
    priceShekels: formatPriceInput(service.priceAgorot),
  };
}

function formatPriceInput(priceAgorot: number | null): string {
  if (priceAgorot == null) {
    return "";
  }
  const shekels = Math.floor(priceAgorot / 100);
  const agorot = priceAgorot % 100;
  return agorot === 0 ? String(shekels) : `${shekels}.${String(agorot).padStart(2, "0")}`;
}

function formatPriceLabel(priceAgorot: number | null): string {
  const price = formatPriceInput(priceAgorot);
  return price ? ` · ₪${price}` : " · מחיר לא הוגדר";
}

function sameInput(left: ServiceInput, right: ServiceInput): boolean {
  return (
    left.name === right.name &&
    left.durationMinutes === right.durationMinutes &&
    left.priceShekels === right.priceShekels
  );
}
