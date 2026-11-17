"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Dialog } from "radix-ui";

export const SheetTitle = Dialog.Title;

/** A step inside the sheet that closing goes back from first; true when it did. */
export type SheetBack = RefObject<(() => boolean) | null>;

const BackContext = createContext<SheetBack | null>(null);

/**
 * While `handler` is set, closing the sheet (scrim, Escape, back button) calls it instead of
 * closing: the ingredient search of a recipe goes back to the recipe, nothing typed is lost.
 */
export function useSheetBack(handler: (() => void) | null) {
  const backRef = useContext(BackContext);
  useEffect(() => {
    if (!backRef || !handler) return;
    const step = () => {
      handler();
      return true;
    };
    backRef.current = step;
    return () => {
      if (backRef.current === step) backRef.current = null;
    };
  }, [backRef, handler]);
}

/**
 * Bottom sheet from the prototype: scrim, grab handle, slides up; closes on scrim or Escape.
 * `back` lets the owner of the back button ask for a step inside the sheet first.
 */
export function Sheet({ onClose, back, children }: { onClose: () => void; back?: SheetBack; children: ReactNode }) {
  const ownRef = useRef<(() => boolean) | null>(null);
  const stepsRef = back ?? ownRef;
  return (
    <Dialog.Root open onOpenChange={(open) => !open && !stepsRef.current?.() && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 bg-[rgba(10,14,12,.45)]" />
        <Dialog.Content
          aria-describedby={undefined}
          // The sheet itself takes the focus, not its first text field: on the phone a focused
          // field brings up the keyboard and covers the sheet (few taps, SPEC 1). A field with
          // autoFocus, such as the search, keeps it.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          className="biss-sheet fixed inset-x-0 bottom-0 z-[21] mx-auto max-h-[90%] w-full max-w-[420px] overflow-y-auto rounded-t-[24px] border-t bg-card px-5 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] text-foreground outline-none"
        >
          <div className="mx-auto mb-3.5 h-1 w-10 rounded-[2px] bg-border" />
          <BackContext.Provider value={stepsRef}>{children}</BackContext.Provider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
