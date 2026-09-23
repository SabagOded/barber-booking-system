"use client";

/* eslint-disable @next/next/no-img-element -- uploaded media is pre-optimized and URLs are storage-provider neutral */

import {
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { clampFocalPosition, moveFocalPositionByArrow } from "@/lib/media/focalPosition";
import { clientImageSizeError } from "@/lib/media/limits";
import type { LogoDisplaySize } from "@/lib/media/logoDisplay";
import { AdminConfirmDialog } from "../_components/AdminConfirmDialog";
import { AdminPageHeader } from "../_components/AdminPageHeader";
import { AdminHelpDialog } from "../_components/AdminHelpDialog";
import { AdminHelpButton } from "../_components/AdminHelpButton";
import {
  removeShopLogo,
  removeShopPortfolioImage,
  saveShopLogoDisplaySize,
  saveShopPortfolioFocalPosition,
  uploadShopLogo,
  uploadShopPortfolioImage,
} from "./actions";

const ACCEPT = "image/jpeg,image/jpg,image/pjpeg,image/png,image/webp";
const PRIMARY =
  "btn-primary flex min-h-12 w-full items-center justify-center rounded-[14px] bg-brass px-4 py-3 text-base font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "flex min-h-11 w-full items-center justify-center rounded-[14px] border border-line-strong px-4 py-2 text-sm font-semibold text-cream hover:bg-card-2 disabled:cursor-not-allowed disabled:opacity-50";

export type AdminPortfolioImage = {
  id: string;
  url: string;
  sortOrder: number;
  focalX: number;
  focalY: number;
};

type ActionResult = {
  ok: boolean;
  error?: string;
  warning?: string;
  logoUrl?: string | null;
  logoDisplaySize?: LogoDisplaySize;
  image?: AdminPortfolioImage;
};

type FeedbackState = {
  scope: string;
  kind: "success" | "error";
  text: string;
} | null;

export function MediaDesk({
  shopName,
  initialLogoUrl,
  initialLogoDisplaySize,
  initialPortfolio,
}: {
  shopName: string;
  initialLogoUrl: string | null;
  initialLogoDisplaySize: LogoDisplaySize;
  initialPortfolio: AdminPortfolioImage[];
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [logoDisplaySize, setLogoDisplaySize] = useState(initialLogoDisplaySize);
  const [portfolio, setPortfolio] = useState(initialPortfolio);
  const [savedPortfolio, setSavedPortfolio] = useState(initialPortfolio);
  const [pending, startTransition] = useTransition();
  const [pendingScope, setPendingScope] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [help, setHelp] = useState<"logo" | "portfolio" | null>(null);
  const [editing, setEditing] = useState<"logo" | "portfolio" | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "logo" | "portfolio"; id?: string } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const portfolioInputRef = useRef<HTMLInputElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement | null>(null);

  function run(scope: string, action: () => Promise<ActionResult>, onSuccess: (result: ActionResult) => void) {
    setFeedback(null);
    setPendingScope(scope);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setFeedback({ scope, kind: "error", text: result.error ?? "לא הצלחנו לשמור את השינוי." });
          return;
        }
        onSuccess(result);
        setFeedback({
          scope,
          kind: result.warning ? "error" : "success",
          text: result.warning ?? "השינויים נשמרו בהצלחה",
        });
      } catch {
        setFeedback({ scope, kind: "error", text: "לא הצלחנו לשמור את השינוי. נסו שוב." });
      } finally {
        setPendingScope(null);
      }
    });
  }

  function upload(file: File | undefined, kind: "logo" | "portfolio") {
    if (!file) return;
    const input = kind === "logo" ? logoInputRef.current : portfolioInputRef.current;
    const sizeError = clientImageSizeError(file.size);
    if (sizeError) {
      setFeedback({ scope: kind, kind: "error", text: sizeError });
      if (input) input.value = "";
      return;
    }
    const formData = new FormData();
    formData.set("image", file);
    run(kind, async () => {
      try {
        return await (kind === "logo"
          ? uploadShopLogo(formData)
          : uploadShopPortfolioImage(formData));
      } finally {
        if (input) input.value = "";
      }
    }, (result) => {
      if (kind === "logo") {
        setLogoUrl(result.logoUrl ?? null);
      } else if (result.image) {
        const image = result.image;
        setPortfolio((current) => [...current, image].sort((a, b) => a.sortOrder - b.sortOrder));
        setSavedPortfolio((current) => [...current, image].sort((a, b) => a.sortOrder - b.sortOrder));
      }
    });
  }

  function openHelp(kind: "logo" | "portfolio", trigger: HTMLButtonElement) {
    helpTriggerRef.current = trigger;
    setHelp(kind);
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-8">
      <AdminPageHeader shopName={shopName} title="תמונות ומיתוג" />

      <section aria-labelledby="shop-media-heading" className="admin-card rounded-[22px] px-5 py-5">
        <h2 id="shop-media-heading" className="font-display text-2xl font-bold text-cream">
          מה הלקוחות רואים
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-sand">הלוגו והעבודות שמוצגים ללקוחות בדף הראשי.</p>

      <div className="mt-6 border-t border-line pt-5">
        <SubsectionHeading title="לוגו העסק" onHelp={(trigger) => openHelp("logo", trigger)} />
        {logoUrl ? (
          <>
            <div className="mt-4 flex h-36 items-center justify-center rounded-[18px] border border-line-strong bg-bg-2 p-4">
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            </div>

            {editing !== "logo" ? (
              <>
                <div className="mt-3 flex items-center justify-between rounded-[14px] border border-line bg-bg-2/55 px-3.5 py-3">
                  <span className="text-xs text-mute">גודל בדף הלקוחות</span>
                  <span className="text-sm font-semibold text-cream">
                    {LOGO_SIZE_OPTIONS.find((option) => option.value === logoDisplaySize)?.label}
                  </span>
                </div>
                <button
                  type="button"
                  className={`${SECONDARY} mt-3 border-brass/55 text-brass-hi`}
                  disabled={pending}
                  onClick={() => {
                    setFeedback(null);
                    setEditing("logo");
                  }}
                >
                  עריכת הלוגו
                </button>
              </>
            ) : (
              <>
                <fieldset className="mt-4">
                  <legend className="text-sm text-sand">גודל הלוגו בדף הלקוחות</legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {LOGO_SIZE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={logoDisplaySize === option.value}
                        disabled={pending}
                        className={`min-h-11 rounded-[12px] border px-2 text-sm font-semibold ${
                          logoDisplaySize === option.value
                            ? "border-brass bg-brass/15 text-brass-hi"
                            : "border-line-strong text-cream hover:bg-card-2"
                        }`}
                        onClick={() =>
                          run("logoSize", () => saveShopLogoDisplaySize(option.value), (result) => {
                            setLogoDisplaySize(result.logoDisplaySize ?? option.value);
                          })
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <Feedback feedback={feedback} scope="logoSize" />
                <button
                  type="button"
                  className={`${SECONDARY} mt-3 text-danger`}
                  disabled={pending}
                  onClick={() => setConfirm({ kind: "logo" })}
                >
                  הסרת הלוגו
                </button>
                <button
                  type="button"
                  className={`${SECONDARY} mt-2`}
                  disabled={pending}
                  onClick={() => {
                    setFeedback(null);
                    setEditing(null);
                  }}
                >
                  סיום עריכה
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <p className="mt-4 rounded-[14px] border border-dashed border-line-strong px-4 py-5 text-center text-sm text-sand">
              עדיין לא הוגדר לוגו לעסק.
            </p>
            <input
              ref={logoInputRef}
              className="sr-only"
              type="file"
              accept={ACCEPT}
              onChange={(event) => upload(event.target.files?.[0], "logo")}
            />
            <button type="button" className={`${PRIMARY} mt-4`} disabled={pending} onClick={() => logoInputRef.current?.click()}>
              {pendingScope === "logo" ? "מעלה לוגו..." : "העלאת לוגו"}
            </button>
          </>
        )}
        <Feedback feedback={feedback} scope="logo" />
      </div>

      <div className="mt-7 border-t border-line pt-5">
        <SubsectionHeading title="תמונות להצגה ללקוחות" onHelp={(trigger) => openHelp("portfolio", trigger)} />

        {portfolio.length > 0 ? (
          editing !== "portfolio" ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {portfolio.map((image, index) => (
                  <div key={image.id} className="overflow-hidden rounded-[16px] border border-line-strong bg-bg-2">
                    <img
                      src={image.url}
                      alt={`עבודה ${index + 1}`}
                      className="aspect-square h-auto w-full object-cover"
                      style={{ objectPosition: `${image.focalX}% ${image.focalY}%` }}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                className={`${SECONDARY} mt-4 border-brass/55 text-brass-hi`}
                onClick={() => {
                  setPortfolio(savedPortfolio);
                  setFeedback(null);
                  setEditing("portfolio");
                }}
              >
                עריכת התמונות
              </button>
            </>
          ) : (
            <>
              <div className="mt-4 space-y-5">
                {portfolio.map((image, index) => (
                  <FocalPositionEditor
                    key={image.id}
                    image={image}
                    index={index}
                    pending={pending}
                    pendingScope={pendingScope}
                    feedback={feedback}
                    onChange={(focalX, focalY) =>
                      setPortfolio((current) =>
                        current.map((item) => (item.id === image.id ? { ...item, focalX, focalY } : item)),
                      )
                    }
                    onSave={(focalX, focalY) =>
                      run(
                        `focal:${image.id}`,
                        () => saveShopPortfolioFocalPosition(image.id, focalX, focalY),
                        () => {
                          setSavedPortfolio((current) =>
                            current.map((item) =>
                              item.id === image.id ? { ...item, focalX, focalY } : item,
                            ),
                          );
                        },
                      )
                    }
                    onRemove={() => setConfirm({ kind: "portfolio", id: image.id })}
                  />
                ))}
              </div>

              {portfolio.length < 5 ? (
                <>
                  <input
                    ref={portfolioInputRef}
                    className="sr-only"
                    type="file"
                    accept={ACCEPT}
                    onChange={(event) => upload(event.target.files?.[0], "portfolio")}
                  />
                  <button type="button" className={`${PRIMARY} mt-4`} disabled={pending} onClick={() => portfolioInputRef.current?.click()}>
                    {pendingScope === "portfolio" ? "מעלה תמונה..." : "הוסף תמונה"}
                  </button>
                </>
              ) : null}

              <button
                type="button"
                className={`${SECONDARY} mt-2`}
                disabled={pending}
                onClick={() => {
                  setPortfolio(savedPortfolio);
                  setFeedback(null);
                  setEditing(null);
                }}
              >
                סיום עריכה
              </button>
            </>
          )
        ) : (
          <>
            <p className="mt-4 rounded-[14px] border border-dashed border-line-strong px-4 py-5 text-center text-sm text-sand">
              עדיין לא נוספו תמונות.
            </p>
            <input
              ref={portfolioInputRef}
              className="sr-only"
              type="file"
              accept={ACCEPT}
              onChange={(event) => upload(event.target.files?.[0], "portfolio")}
            />
            <button type="button" className={`${PRIMARY} mt-4`} disabled={pending} onClick={() => portfolioInputRef.current?.click()}>
              {pendingScope === "portfolio" ? "מעלה תמונה..." : "הוסף תמונה"}
            </button>
          </>
        )}
        <Feedback feedback={feedback} scope="portfolio" />
      </div>

      {help ? (
        <AdminHelpDialog
          title={help === "logo" ? "לוגו העסק" : "תמונות להצגה ללקוחות"}
          items={
            help === "logo"
              ? [
                  "הלוגו מוצג ללקוחות בראש דף קביעת התורים.",
                  "אפשר להתאים את גודל התצוגה שלו מתוך הגדרות הלוגו.",
                  "מומלץ להעלות לוגו ללא רקע כדי לקבל תוצאה נקייה יותר.",
                  "ניתן להעלות PNG, JPEG או WEBP עד 15MB.",
                ]
              : [
                  "אפשר להציג עד 5 תמונות בדף הראשי.",
                  "אחרי ההעלאה ניתן להתאים איזה חלק מהתמונה יוצג במסגרת הריבועית.",
                  "ניתן להעלות PNG, JPEG או WEBP עד 15MB.",
                ]
          }
          onClose={() => {
            setHelp(null);
            helpTriggerRef.current?.focus();
          }}
        />
      ) : null}

      {confirm ? (
        <AdminConfirmDialog
          title={confirm.kind === "logo" ? "להסיר את הלוגו?" : "להסיר את התמונה?"}
          confirmLabel="הסרה"
          pendingLabel="מסיר..."
          pending={pending}
          error={null}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const current = confirm;
            if (current.kind === "logo") {
              run("logo", removeShopLogo, (result) => setLogoUrl(result.logoUrl ?? null));
            } else if (current.id) {
              run("portfolio", () => removeShopPortfolioImage(current.id!), () => {
                setPortfolio((items) => items.filter((item) => item.id !== current.id));
                setSavedPortfolio((items) => items.filter((item) => item.id !== current.id));
              });
            }
            setConfirm(null);
          }}
        >
          הפעולה מסירה את הפריט מדף קביעת התורים.
        </AdminConfirmDialog>
      ) : null}
      </section>
    </main>
  );
}

function FocalPositionEditor({
  image,
  index,
  pending,
  pendingScope,
  feedback,
  onChange,
  onSave,
  onRemove,
}: {
  image: AdminPortfolioImage;
  index: number;
  pending: boolean;
  pendingScope: string | null;
  feedback: FeedbackState;
  onChange: (x: number, y: number) => void;
  onSave: (x: number, y: number) => void;
  onRemove: () => void;
}) {
  const drag = useRef<{ pointerId: number; x: number; y: number; focalX: number; focalY: number } | null>(null);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (pending) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      focalX: image.focalX,
      focalY: image.focalY,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onChange(
      clampFocalPosition(start.focalX - ((event.clientX - start.x) / rect.width) * 100),
      clampFocalPosition(start.focalY - ((event.clientY - start.y) / rect.height) * 100),
    );
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown"
    ) {
      return;
    }
    const step = event.shiftKey ? 10 : 2;
    const next = moveFocalPositionByArrow(image.focalX, image.focalY, event.key, step);
    onChange(next.focalX, next.focalY);
    event.preventDefault();
  }

  return (
    <article className="rounded-[18px] border border-line bg-bg-2 p-3">
      <div
        className="relative aspect-square w-full cursor-grab touch-none overflow-hidden rounded-[14px] border border-line-strong outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-brass"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
        role="group"
        aria-label={`תצוגה מקדימה של תמונה ${index + 1}. גררו או השתמשו במקשי החצים כדי לשנות את המיקום.`}
      >
        <img
          src={image.url}
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full select-none object-cover"
          style={{ objectPosition: `${image.focalX}% ${image.focalY}%` }}
        />
        <span className="pointer-events-none absolute inset-x-3 bottom-3 rounded-full bg-ink/75 px-3 py-1.5 text-center text-xs text-cream">
          גררו את התמונה למיקום הרצוי
        </span>
      </div>

      <button
        type="button"
        className={`${PRIMARY} mt-3`}
        disabled={pending}
        onClick={() => onSave(image.focalX, image.focalY)}
      >
        {pendingScope === `focal:${image.id}` ? "שומר מיקום..." : "שמירת מיקום"}
      </button>
      <Feedback feedback={feedback} scope={`focal:${image.id}`} />
      <button type="button" className={`${SECONDARY} mt-2 text-danger`} disabled={pending} onClick={onRemove}>
        הסרה
      </button>
    </article>
  );
}

function SubsectionHeading({ title, onHelp }: { title: string; onHelp: (trigger: HTMLButtonElement) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-display text-xl font-bold text-cream">{title}</h3>
      <AdminHelpButton onClick={(event) => onHelp(event.currentTarget)} />
    </div>
  );
}

function Feedback({ feedback, scope }: { feedback: FeedbackState; scope: string }) {
  if (!feedback || feedback.scope !== scope) return null;
  return (
    <p role={feedback.kind === "error" ? "alert" : "status"} className={`mt-3 rounded-[12px] border px-3 py-2 text-sm ${feedback.kind === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-line bg-bg-2 text-ok"}`}>
      {feedback.text}
    </p>
  );
}

const LOGO_SIZE_OPTIONS: { value: LogoDisplaySize; label: string }[] = [
  { value: "small", label: "קטן" },
  { value: "medium", label: "בינוני" },
  { value: "large", label: "גדול" },
];
