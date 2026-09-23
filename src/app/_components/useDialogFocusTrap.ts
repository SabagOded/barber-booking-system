"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useDialogFocusTrap({
  open,
  dialogRef,
  onEscape,
}: {
  open: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  onEscape: () => void;
}) {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusableElements = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.getClientRects().length > 0,
      );
    const focusFrame = window.requestAnimationFrame(() => {
      const [first] = focusableElements();
      (first ?? dialog).focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      const openDialogs = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
      if (openDialogs[openDialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus();
      }
    };
  }, [dialogRef, open]);
}
