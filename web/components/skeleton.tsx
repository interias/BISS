"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Under about a second no indicator is wanted (NN/g): a fast answer never shows one. */
export const SHOW_AFTER_MS = 300;

/** True once `active` has lasted `ms`; false again as soon as it ends. */
export function useDelayed(active: boolean, ms = SHOW_AFTER_MS) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setShown(true), ms);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [active, ms]);
  return active && shown;
}

/** A grey stand-in for text or a picture, pulsing unless motion is reduced. */
export function Bone({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block rounded-md bg-tile motion-safe:animate-pulse", className)} />;
}

/** Announces the wait once to a screen reader; the bones themselves are hidden from it. */
function Loading({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label="Lädt …">
      {children}
    </div>
  );
}

/** Rows like those of the diary and the recipe list: picture, two lines, value. */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Loading>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-dashed py-[9px]">
          <Bone className="size-11 rounded-xl" />
          <span className="grid gap-1.5">
            <Bone className="h-3.5 w-3/5" />
            <Bone className="h-3 w-2/5" />
          </span>
          <Bone className="h-3.5 w-9" />
        </div>
      ))}
    </Loading>
  );
}

/** Heute while the day loads: the ring and three bars of the day summary, then diary rows. */
export function DaySkeleton() {
  return (
    <Loading>
      <div className="grid grid-cols-[auto_1fr] items-center gap-5 pt-2 pb-4">
        <Bone className="size-[150px] rounded-full" />
        <span className="grid gap-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="grid gap-1.5">
              <Bone className="h-3.5 w-3/4" />
              <Bone className="h-[7px] w-full" />
            </span>
          ))}
        </span>
      </div>
      <div className="border-t pt-2">
        <RowsSkeleton rows={3} />
      </div>
    </Loading>
  );
}

/** Statistik before its first answer: the big average, two lines and the chart. */
export function StatsSkeleton() {
  return (
    <Loading>
      <div className="mt-1.5 grid gap-2 border-t py-[13px]">
        <Bone className="h-[38px] w-40" />
        <Bone className="h-3.5 w-4/5" />
        <Bone className="h-3.5 w-3/5" />
      </div>
      <div className="grid gap-2 border-t py-[13px]">
        <Bone className="h-3 w-28" />
        <Bone className="h-[150px] w-full rounded-xl" />
      </div>
    </Loading>
  );
}
