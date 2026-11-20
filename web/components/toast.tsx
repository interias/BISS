"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export const TOAST_MS = 3000;

type ToastState = { id: number; text: string; onUndo?: () => void; error?: boolean; onRetry?: () => void };

/**
 * One toast at a time; it hides itself after 3 s (SPEC 3). An error stays until it is tapped
 * away or the next toast replaces it, with "Nochmal" when the action can be repeated.
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const show = useCallback(
    (text: string, onUndo?: () => void) => setToast({ id: Date.now(), text, onUndo }),
    [],
  );
  const showError = useCallback(
    (text: string, onRetry?: () => void) => setToast({ id: Date.now(), text, error: true, onRetry }),
    [],
  );
  const hide = useCallback(() => setToast(null), []);
  return { toast, show, showError, hide };
}

/**
 * Toast above the dock, with "Rückgängig" when an undo is given; an error with "Nochmal" or
 * "OK". `bottom` is its distance in
 * px from the lower edge, so it stands above whatever bars are shown. Over an open sheet it
 * stands `top`, on the free strip of the scrim, and covers no button of the sheet. It lives in
 * the body: inside the app it stood under every sheet (Sheet lets a tap on it through).
 */
export function Toast({
  toast,
  onHide,
  bottom = 150,
  top = false,
}: {
  toast: ToastState | null;
  onHide: () => void;
  bottom?: number;
  top?: boolean;
}) {
  if (!toast) return null;
  return createPortal(
    <div
      data-toast
      className="pointer-events-none fixed inset-x-0 z-40 mx-auto w-full max-w-[420px] px-4"
      style={
        top
          ? { top: "calc(12px + env(safe-area-inset-top, 0px))" }
          : { bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))` }
      }
    >
      <div
        role={toast.error ? "alert" : "status"}
        className="pointer-events-auto flex items-center justify-between gap-3 rounded-[14px] bg-foreground px-3.5 py-3 text-sm font-semibold text-card shadow-[0_10px_30px_-10px_var(--biss-shadow)]"
      >
        <span>{toast.text}</span>
        {toast.error && (
          <button
            type="button"
            className="flex-none font-bold text-accent"
            onClick={() => {
              onHide();
              toast.onRetry?.();
            }}
          >
            {toast.onRetry ? "Nochmal" : "OK"}
          </button>
        )}
        {toast.onUndo && (
          <button
            type="button"
            className="font-bold text-accent"
            onClick={() => {
              onHide();
              toast.onUndo?.();
            }}
          >
            Rückgängig
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
