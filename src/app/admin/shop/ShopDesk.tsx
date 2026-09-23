"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { AdminHelpDialog } from "../_components/AdminHelpDialog";
import { AdminHelpButton } from "../_components/AdminHelpButton";
import { AdminPageHeader } from "../_components/AdminPageHeader";
import {
  clearHomeNotice,
  saveCalendarNote,
  saveHomeNotice,
  saveShopDetails,
} from "./actions";

const FIELD =
  "h-12 w-full rounded-[14px] border border-line bg-bg-2 px-3 text-base text-cream outline-none [color-scheme:dark] focus:border-brass disabled:cursor-not-allowed disabled:opacity-40";
const TEXTAREA =
  "w-full rounded-[14px] border border-line bg-bg-2 px-3 py-3 text-base leading-relaxed text-cream outline-none focus:border-brass disabled:cursor-not-allowed disabled:opacity-40";
const PRIMARY =
  "btn-primary flex min-h-12 w-full items-center justify-center rounded-[14px] bg-brass px-4 py-3 text-base font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "flex min-h-12 w-full items-center justify-center rounded-[14px] border border-line-strong px-4 py-3 text-sm font-semibold text-cream hover:bg-card-2 disabled:cursor-not-allowed disabled:opacity-50";
const SECTION =
  "admin-card rounded-[22px] px-5 py-5";

type ShopDetails = {
  businessName: string;
  providerName: string;
  tagline: string;
  address: string;
  phone: string;
  whatsappPhone: string;
};

type Feedback = {
  scope: "details" | "calendar" | "notice";
  kind: "success" | "error";
  text: string;
  field?: "businessName" | "doorNoticeUntil";
};

type ActionResult = {
  ok: boolean;
  error?: string;
  field?: "businessName" | "doorNoticeUntil";
};

type HelpKind = Feedback["scope"];

const HELP: Record<HelpKind, { title: string; items: string[] }> = {
  details: {
    title: "פרטי העסק",
    items: [
      "אלו הפרטים המרכזיים שהלקוחות רואים על העסק.",
      "שינוי כאן יעדכן את שם העסק, התיאור ופרטי יצירת הקשר שמוצגים ללקוחות.",
      "הזינו מספרי טלפון ברורים ועדכניים כדי שהלקוחות יוכלו ליצור קשר בקלות.",
    ],
  },
  calendar: {
    title: "עריכת פרטי יומן",
    items: [
      "הטקסט הזה מצורף לפרטי היומן כאשר לקוח מוסיף את התור ליומן Google.",
      "אפשר לכתוב כאן מידע שימושי לקראת ההגעה, כמו כתובת או הנחיה קצרה.",
      "השינוי ישפיע על פרטי יומן שייווצרו מכאן והלאה.",
      "תורים שכבר נקבעו נשארים ללא שינוי.",
    ],
  },
  notice: {
    title: "הודעה בדף הבית",
    items: [
      "ההודעה מוצגת ללקוחות בדף הבית של העסק.",
      "אפשר להשתמש בה לחגים, סגירה זמנית, עדכון או מידע חריג.",
      "אם בוחרים תאריך סיום, ההודעה מפסיקה להופיע לאחר התאריך הזה.",
      "הסרת ההודעה מסתירה אותה מדף הבית.",
    ],
  },
};

function sameDetails(left: ShopDetails, right: ShopDetails): boolean {
  return Object.keys(left).every(
    (key) => left[key as keyof ShopDetails] === right[key as keyof ShopDetails],
  );
}

export function ShopDesk({
  shopName,
  details: initialDetails,
  calendarNote: initialCalendarNote,
  notice: initialNotice,
}: {
  shopName: string;
  details: ShopDetails;
  calendarNote: string;
  notice: { text: string; until: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [details, setDetails] = useState(initialDetails);
  const [savedDetails, setSavedDetails] = useState(initialDetails);
  const [calendarNote, setCalendarNote] = useState(initialCalendarNote);
  const [savedCalendarNote, setSavedCalendarNote] = useState(initialCalendarNote);
  const [notice, setNotice] = useState(initialNotice);
  const [savedNotice, setSavedNotice] = useState(initialNotice);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [help, setHelp] = useState<HelpKind | null>(null);
  const [editing, setEditing] = useState<HelpKind | null>(null);
  const helpTriggerRef = useRef<HTMLButtonElement | null>(null);

  const detailsChanged = !sameDetails(details, savedDetails);
  const calendarChanged = calendarNote !== savedCalendarNote;
  const noticeChanged = notice.text !== savedNotice.text || notice.until !== savedNotice.until;
  const savedNoticeHasContent = Boolean(savedNotice.text || savedNotice.until);
  const noticeExpired =
  Boolean(savedNotice.until) && savedNotice.until < todayInIsrael();

  const closeHelp = useCallback(() => {
    helpTriggerRef.current?.focus();
    setHelp(null);
  }, []);

  function clearScopeFeedback(scope: Feedback["scope"]) {
    setFeedback((current) => (current?.scope === scope ? null : current));
  }

  function run(
    scope: Feedback["scope"],
    action: () => Promise<ActionResult>,
    onSuccess: () => void,
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
            field: result.field,
          });
          return;
        }
        onSuccess();
        setEditing(null);
        setFeedback({ scope, kind: "success", text: "השינויים נשמרו בהצלחה" });
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

  function openHelp(kind: HelpKind, trigger: HTMLButtonElement) {
    helpTriggerRef.current = trigger;
    setHelp(kind);
  }

  function cancelEdit(scope: HelpKind) {
    if (scope === "details") setDetails(savedDetails);
    if (scope === "calendar") setCalendarNote(savedCalendarNote);
    if (scope === "notice") setNotice(savedNotice);
    clearScopeFeedback(scope);
    setEditing(null);
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-8">
      <AdminPageHeader shopName={shopName} title="עריכת פרטי החנות" />

      <section aria-labelledby="shop-details-heading" className={SECTION}>
        <SectionHeading
          id="shop-details-heading"
          title="פרטי העסק"
          descriptionLines={[
            "הפרטים שהלקוחות רואים על העסק,",
            "כולל דרכי יצירת הקשר.",
          ]}
          onHelp={(trigger) => openHelp("details", trigger)}
        />

        {editing !== "details" ? (
          <>
            <div className="mt-5 space-y-2">
              <SummaryRow label="שם החנות" value={savedDetails.businessName || "לא הוגדר"} />
              <SummaryRow label="שם נותן השירות" value={savedDetails.providerName || "לא הוגדר"} />
              <SummaryRow label="שורת תיאור" value={savedDetails.tagline || "לא הוגדרה"} />
              <SummaryRow label="כתובת" value={savedDetails.address || "לא הוגדרה"} />
              <SummaryRow label="טלפון" value={savedDetails.phone || "לא הוגדר"} ltr />
              <SummaryRow
                label="וואטסאפ"
                value={savedDetails.whatsappPhone || "כמו הטלפון הראשי"}
                ltr={Boolean(savedDetails.whatsappPhone)}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setDetails(savedDetails);
                setFeedback(null);
                setEditing("details");
              }}
              className={SECONDARY + " mt-4 border-brass/55 text-brass-hi"}
            >
              עריכת פרטי העסק
            </button>
            <SectionFeedback feedback={feedback} scope="details" />
          </>
        ) : (
          <>
            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm text-sand">שם החנות</span>
                <input
                  value={details.businessName}
                  onChange={(event) => {
                    setDetails((current) => ({ ...current, businessName: event.target.value }));
                    clearScopeFeedback("details");
                  }}
                  autoComplete="organization"
                  placeholder="למשל: שם העסק שלך"
                  className={FIELD}
                />
                <FieldFeedback feedback={feedback} scope="details" field="businessName" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-sand">שם נותן השירות</span>
                <input
                  value={details.providerName}
                  onChange={(event) => {
                    setDetails((current) => ({ ...current, providerName: event.target.value }));
                    clearScopeFeedback("details");
                  }}
                  autoComplete="name"
                  placeholder="למשל: נותן השירות"
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-sand">שורת תיאור</span>
                <input
                  value={details.tagline}
                  onChange={(event) => {
                    setDetails((current) => ({ ...current, tagline: event.target.value }));
                    clearScopeFeedback("details");
                  }}
                  placeholder="למשל: שירותים מקצועיים בהתאמה אישית."
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-sand">כתובת</span>
                <input
                  value={details.address}
                  onChange={(event) => {
                    setDetails((current) => ({ ...current, address: event.target.value }));
                    clearScopeFeedback("details");
                  }}
                  autoComplete="street-address"
                  placeholder="למשל: רחוב ומספר בית"
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-sand">טלפון</span>
                <input
                  type="tel"
                  value={details.phone}
                  onChange={(event) => {
                    setDetails((current) => ({ ...current, phone: event.target.value }));
                    clearScopeFeedback("details");
                  }}
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="למשל: 050-000-0000"
                  className={FIELD + " text-left"}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-sand">טלפון לוואטסאפ (אופציונלי)</span>
                <input
                  type="tel"
                  value={details.whatsappPhone}
                  onChange={(event) => {
                    setDetails((current) => ({ ...current, whatsappPhone: event.target.value }));
                    clearScopeFeedback("details");
                  }}
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="ברירת מחדל: הטלפון הראשי"
                  className={FIELD + " text-left"}
                />
              </label>
            </div>

            <button
              type="button"
              disabled={pending || !detailsChanged}
              className={PRIMARY + " mt-4"}
              onClick={() =>
                run("details", () => saveShopDetails(details), () => setSavedDetails(details))
              }
            >
              {pending ? "שומר..." : "שמירת פרטי העסק"}
            </button>
            <button
              type="button"
              disabled={pending}
              className={SECONDARY + " mt-2"}
              onClick={() => cancelEdit("details")}
            >
              ביטול
            </button>
            <SectionFeedback feedback={feedback} scope="details" />
          </>
        )}
      </section>

      <section aria-labelledby="calendar-details-heading" className={SECTION}>
        <SectionHeading
          id="calendar-details-heading"
          title="עריכת פרטי יומן"
          descriptionLines={[
            "טקסט שימושי שמצורף לתור כאשר",
            "הלקוח מוסיף אותו ליומן Google.",
          ]}
          onHelp={(trigger) => openHelp("calendar", trigger)}
        />

        {editing !== "calendar" ? (
          <>
            <div className="mt-5 rounded-[16px] border border-line-strong bg-bg-2/65 p-4">
              <p className="text-xs font-semibold text-mute">הטקסט הנוכחי</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-cream">
                {savedCalendarNote || "לא הוגדר טקסט נוסף ליומן."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCalendarNote(savedCalendarNote);
                setFeedback(null);
                setEditing("calendar");
              }}
              className={SECONDARY + " mt-4 border-brass/55 text-brass-hi"}
            >
              עריכת פרטי היומן
            </button>
            <SectionFeedback feedback={feedback} scope="calendar" />
          </>
        ) : (
          <>
            <label className="mt-5 block">
              <span className="mb-1 block text-sm text-sand">פרטים שיופיעו ביומן</span>
              <textarea
                value={calendarNote}
                onChange={(event) => {
                  setCalendarNote(event.target.value);
                  clearScopeFeedback("calendar");
                }}
                rows={5}
                className={TEXTAREA}
              />
            </label>
            <button
              type="button"
              disabled={pending || !calendarChanged}
              className={PRIMARY + " mt-4"}
              onClick={() =>
                run("calendar", () => saveCalendarNote(calendarNote), () => {
                  setSavedCalendarNote(calendarNote);
                })
              }
            >
              {pending ? "שומר..." : "שמירת פרטי יומן"}
            </button>
            <button
              type="button"
              disabled={pending}
              className={SECONDARY + " mt-2"}
              onClick={() => cancelEdit("calendar")}
            >
              ביטול
            </button>
            <SectionFeedback feedback={feedback} scope="calendar" />
          </>
        )}
      </section>

      <section aria-labelledby="home-notice-heading" className={SECTION}>
        <SectionHeading
          id="home-notice-heading"
          title="הודעה בדף הבית"
          descriptionLines={[
            "הצגת הודעה בדף הבית עבור הלקוחות,",
            "לעדכון זמני או מידע חשוב.",
          ]}
          onHelp={(trigger) => openHelp("notice", trigger)}
        />

        {editing !== "notice" ? (
          <>
            <div className="mt-5 rounded-[16px] border border-line-strong bg-bg-2/65 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-mute">מצב ההודעה</p>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  savedNoticeHasContent && !noticeExpired
                    ? "border-ok/40 bg-ok/10 text-ok"
                    : "border-line-strong text-sand"
                }`}>
                  {savedNoticeHasContent ? (noticeExpired ? "פג תוקף" : "מוצגת") : "אין הודעה"}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-cream">
                {savedNotice.text || "לא מוגדרת כרגע הודעה ללקוחות."}
              </p>
              {savedNotice.until ? (
                <p className="mt-3 text-xs text-sand">
                  מוצגת עד <span dir="ltr" className="tabular inline-block">{savedNotice.until}</span>
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setNotice(savedNotice);
                setFeedback(null);
                setEditing("notice");
              }}
              className={SECONDARY + " mt-4 border-brass/55 text-brass-hi"}
            >
              עריכת ההודעה
            </button>
            <SectionFeedback feedback={feedback} scope="notice" />
          </>
        ) : (
          <>
            <label className="mt-5 block">
              <span className="mb-1 block text-sm text-sand">תוכן ההודעה</span>
              <textarea
                value={notice.text}
                onChange={(event) => {
                  setNotice((current) => ({ ...current, text: event.target.value }));
                  clearScopeFeedback("notice");
                }}
                rows={4}
                className={TEXTAREA}
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-sm text-sand">הצגה עד תאריך (לא חובה)</span>
              <input
                type="date"
                value={notice.until}
                onChange={(event) => {
                  setNotice((current) => ({ ...current, until: event.target.value }));
                  clearScopeFeedback("notice");
                }}
                className={FIELD}
                dir="ltr"
              />
              <FieldFeedback feedback={feedback} scope="notice" field="doorNoticeUntil" />
              {noticeExpired ? (
                <p role="status" className="mt-2 rounded-[12px] border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  תוקף ההודעה הסתיים, ולכן היא אינה מוצגת ללקוחות.
                </p>
              ) : null}
            </label>
            <button
              type="button"
              disabled={pending || !noticeChanged}
              className={PRIMARY + " mt-4"}
              onClick={() =>
                run("notice", () => saveHomeNotice(notice), () => setSavedNotice(notice))
              }
            >
              {pending ? "שומר..." : "שמירת ההודעה"}
            </button>
            <button
              type="button"
              disabled={pending || !savedNoticeHasContent}
              className={SECONDARY + " mt-2 text-danger"}
              onClick={() =>
                run("notice", () => clearHomeNotice(), () => {
                  const empty = { text: "", until: "" };
                  setNotice(empty);
                  setSavedNotice(empty);
                })
              }
            >
              הסרת ההודעה
            </button>
            <button
              type="button"
              disabled={pending}
              className={SECONDARY + " mt-2"}
              onClick={() => cancelEdit("notice")}
            >
              ביטול
            </button>
            <SectionFeedback feedback={feedback} scope="notice" />
          </>
        )}
      </section>

      {help ? (
        <AdminHelpDialog title={HELP[help].title} items={HELP[help].items} onClose={closeHelp} />
      ) : null}
    </main>
  );
}

function todayInIsrael(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function SectionHeading({
  id,
  title,
  descriptionLines,
  onHelp,
}: {
  id: string;
  title: string;
  descriptionLines: string[];
  onHelp: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-balance text-2xl font-bold text-cream">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-sand">
          {descriptionLines.map((line) => (
            <span key={line} className="block">{line}</span>
          ))}
        </p>
      </div>
      <AdminHelpButton onClick={(event) => onHelp(event.currentTarget)} />
    </div>
  );
}


function SummaryRow({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[14px] border border-line bg-bg-2/55 px-3.5 py-3">
      <span className="text-xs text-mute">{label}</span>
      <span className="min-w-0 truncate text-sm font-semibold text-cream" dir={ltr ? "ltr" : undefined}>
        {value}
      </span>
    </div>
  );
}

function FieldFeedback({
  feedback,
  scope,
  field,
}: {
  feedback: Feedback | null;
  scope: Feedback["scope"];
  field: NonNullable<Feedback["field"]>;
}) {
  if (feedback?.scope !== scope || feedback.kind !== "error" || feedback.field !== field) {
    return null;
  }
  return (
    <span role="alert" className="mt-1 block text-sm text-danger">
      {feedback.text}
    </span>
  );
}

function SectionFeedback({
  feedback,
  scope,
}: {
  feedback: Feedback | null;
  scope: Feedback["scope"];
}) {
  if (!feedback || feedback.scope !== scope || feedback.field) {
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
