"use client";

import { useEffect, useState } from "react";
import type { Macros } from "@/lib/api";
import { fmt } from "@/lib/format";

const RADIUS = 56;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Stroke dash of the kcal arc: the eaten share of the goal, full at most. */
export function ringDash(kcal: number, goal: number) {
  const share = goal > 0 ? Math.min(kcal / goal, 1) : 0;
  return `${CIRCUMFERENCE * share} ${CIRCUMFERENCE}`;
}

/** Width of a macro bar in percent of the goal, full at most. */
export function barWidth(value: number, goal: number) {
  return `${goal > 0 ? Math.min((value / goal) * 100, 100) : 0}%`;
}

const BARS = [
  { key: "protein", label: "Eiweiß", color: "var(--biss-prot)" },
  { key: "carbs", label: "Kohlenhydrate", color: "var(--biss-carb)" },
  { key: "fat", label: "Fett", color: "var(--biss-fat)" },
] as const;

/** Day summary: segmented kcal ring with animated fill and three macro bars (Ist/Soll in g). */
export function DaySummary({ totals, targets }: { totals: Macros; targets: Macros }) {
  // The arc starts empty and fills after the first paint, so the transition runs.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <section
      aria-label="Tagesbilanz"
      className="grid grid-cols-[132px_1fr] items-center gap-[18px] border-b pt-2.5 pb-[18px] max-[380px]:grid-cols-[112px_1fr] max-[380px]:gap-3.5"
    >
      <div className="relative size-[132px] max-[380px]:size-[112px]">
        <svg viewBox="0 0 132 132" className="block size-full" aria-hidden="true">
          <circle cx="66" cy="66" r={RADIUS} fill="none" stroke="var(--biss-surface-2)" strokeWidth="12" />
          <circle cx="66" cy="66" r={RADIUS} fill="none" stroke="var(--biss-line)" strokeWidth="1" />
          <circle
            data-testid="ring-arc"
            className="biss-ring-arc"
            cx="66"
            cy="66"
            r={RADIUS}
            fill="none"
            stroke="var(--biss-accent)"
            strokeWidth="12"
            strokeLinecap="butt"
            transform="rotate(-90 66 66)"
            strokeDasharray={shown ? ringDash(totals.kcal, targets.kcal) : "0 999"}
          />
          {/* Gaps in the surface colour cut the ring into segments. */}
          <circle
            cx="66"
            cy="66"
            r={RADIUS}
            fill="none"
            stroke="var(--biss-surface)"
            strokeWidth="13"
            strokeDasharray="1.4 7.3"
            transform="rotate(-90 66 66)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            data-testid="kcal-total"
            className="font-heading text-[30px] leading-none font-extrabold tabular-nums max-[380px]:text-[25px]"
          >
            {fmt(totals.kcal)}
          </span>
          <span className="mt-1 text-xs text-muted-foreground tabular-nums">
            von {fmt(targets.kcal)} kcal
          </span>
        </div>
      </div>
      <div className="grid min-w-0 gap-3">
        {BARS.map(({ key, label, color }) => (
          <div key={key} data-testid={`macro-${key}`}>
            <div className="mb-[5px] flex justify-between text-[13px] tabular-nums">
              <span className="font-semibold">{label}</span>
              <span className="text-muted-foreground">
                <b className="text-foreground">{fmt(totals[key])}</b> / {fmt(targets[key])} g
              </span>
            </div>
            <div className="h-[7px] overflow-hidden rounded-[4px] border bg-surface-2">
              <i
                className="block h-full rounded-[4px]"
                style={{ width: barWidth(totals[key], targets[key]), background: color }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
