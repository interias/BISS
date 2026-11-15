"use client";

import { kicker } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { SheetTitle } from "@/components/sheet";

/**
 * The sheet while a meal is dictated (ADR-0013): what the phone hears in large type and
 * "Fertig", which ends the listening. Then the sentence stays while the backend reads it.
 */
export function DictationSheet({ heard, reading, onStop }: { heard: string; reading: boolean; onStop: () => void }) {
  return (
    <div className="grid gap-4 pt-2 pb-1 text-center">
      <SheetTitle className={cn(kicker, "text-primary")}>{reading ? "Erkenne Gericht …" : "Ich höre zu"}</SheetTitle>
      <p
        data-testid="heard"
        className={cn(
          "min-h-[2.4em] font-heading text-[22px] leading-tight font-semibold text-balance [overflow-wrap:anywhere]",
          !heard && "text-muted-foreground",
        )}
      >
        {heard || "„Zwei Scheiben Brot mit Käse und ein Kaffee“"}
      </p>
      {reading ? (
        <p role="status" className="text-[13px] text-muted-foreground">
          Die Lebensmittel werden gesucht und geschätzt.
        </p>
      ) : (
        <button
          type="button"
          onClick={onStop}
          className="flex h-[54px] items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="5" y="5" width="14" height="14" rx="2.5" />
          </svg>
          Fertig
        </button>
      )}
    </div>
  );
}
