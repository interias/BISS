"use client";

import type { ReactNode } from "react";
import { Dialog } from "radix-ui";

export const SheetTitle = Dialog.Title;

/** Bottom sheet from the prototype: scrim, grab handle, slides up; closes on scrim or Escape. */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
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
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
