"use client";

/* eslint-disable @next/next/no-img-element -- uploaded media is pre-optimized and URLs are storage-provider neutral */

import { useRef, useState, type KeyboardEvent } from "react";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

export type PublicPortfolioImage = {
  id: string;
  url: string;
  focalX: number;
  focalY: number;
};

export function PortfolioGallery({ images }: { images: PublicPortfolioImage[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function close() {
    setActiveIndex(null);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useDialogFocusTrap({ open: activeIndex !== null, dialogRef, onEscape: close });

  if (images.length === 0) return null;

  function move(delta: number) {
    setActiveIndex((current) =>
      current === null ? current : (current + delta + images.length) % images.length,
    );
  }

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" && images.length > 1) {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowRight" && images.length > 1) {
      event.preventDefault();
      move(-1);
    }
  }

  return (
    <section aria-labelledby="portfolio-heading" className="my-4 w-full rounded-[14px] border border-brass/45 bg-[#1f1c19]/85 p-4">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-brass/35" aria-hidden="true" />
        <h2 id="portfolio-heading" className="font-display text-center text-2xl font-bold leading-tight text-cream">
          עבודות נבחרות
        </h2>
        <span className="h-px flex-1 bg-brass/35" aria-hidden="true" />
      </div>

      <div className="mt-4 grid h-28 grid-cols-[1.35fr_1fr_1fr] gap-2 rounded-[11px] border border-brass/20 bg-[#28241f]/85 p-1.5 sm:h-36">
        {images.slice(0, 3).map((image, imageIndex) => (
          <button
            key={image.id}
            type="button"
            className={`group relative overflow-hidden border border-line-strong bg-bg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass ${previewTileClass(images.length, imageIndex)}`}
            aria-label={`פתיחת תמונה ${imageIndex + 1} מתוך ${images.length}`}
            onClick={(event) => {
              triggerRef.current = event.currentTarget;
              setActiveIndex(imageIndex);
            }}
          >
            <img
              src={image.url}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
              style={{ objectPosition: `${image.focalX}% ${image.focalY}%` }}
            />
            <span aria-hidden="true" className="absolute inset-0 ring-1 ring-inset ring-cream/5" />
            {imageIndex === 2 && images.length > 3 ? (
              <span className="absolute inset-0 flex items-end justify-center bg-ink/30 pb-2 text-[11px] font-bold text-cream">
                +{images.length - 3}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeIndex !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm" role="presentation" onClick={close}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`תמונה ${activeIndex + 1} מתוך ${images.length}`}
            tabIndex={-1}
            className="relative flex h-full max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl items-center justify-center"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onDialogKeyDown}
          >
            <button type="button" onClick={close} autoFocus className="absolute left-2 top-2 z-10 flex size-11 items-center justify-center rounded-full border border-white/35 bg-black/65 text-white" aria-label="סגירת התמונה">
              <CloseIcon />
            </button>
            <img src={images[activeIndex]!.url} alt="" className="max-h-full max-w-full object-contain" />
            {images.length > 1 ? (
              <>
                <button type="button" onClick={() => move(-1)} className="absolute right-2 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/65 text-2xl text-white" aria-label="התמונה הקודמת">
                  <ChevronIcon direction="right" />
                </button>
                <button type="button" onClick={() => move(1)} className="absolute left-2 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/65 text-2xl text-white" aria-label="התמונה הבאה">
                  <ChevronIcon direction="left" />
                </button>
              </>
            ) : null}
            <p className="absolute bottom-2 rounded-full bg-black/65 px-3 py-1.5 text-sm text-white">
              {activeIndex + 1} / {images.length}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function previewTileClass(count: number, index: number): string {
  const span = count === 1 || (count === 2 && index === 0) ? (count === 1 ? "col-span-3" : "col-span-2") : "col-span-1";
  return `${span} ${index === 0 ? "rounded-[7px_18px_7px_18px]" : "rounded-[14px_7px_14px_7px]"}`;
}


function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 8 8M14 6l-8 8" /></svg>;
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === "left" ? "m12 5-5 5 5 5" : "m8 5 5 5-5 5"} />
    </svg>
  );
}
